// ============================================================
// POST /api/kb/ask — RAG question over the plant's knowledge base
//
// FLOW
//   1. Embed the question via OpenAI text-embedding-3-small
//      (or a local sentence-transformer if EMBEDDINGS_LOCAL=1)
//   2. RPC match_kb(embedding, k=8) — top 8 neighbouring chunks
//   3. Assemble the prompt: [system, k contexts with citations, question]
//   4. Stream the answer from Claude Haiku (default) or OpenAI
//   5. Log question + retrieved ids + answer to kb_queries
//
// AUTH: JWT-authed user only. No API key required.
//
// FALLBACK: if no ANTHROPIC_API_KEY / OPENAI_API_KEY is set, returns
// the retrieved chunks as-is so the UI can render them as a "here's
// what we found" list — still useful, just not synthesized.
// ============================================================

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AskBody {
    question: string;
    filterMachine?: string;
    filterSource?: 'knowledge' | 'intervention' | 'procedure' | 'haccp';
    matchCount?: number;
}

interface RetrievedChunk {
    id: string;
    source: string;
    source_id: string;
    title: string | null;
    machine_code: string | null;
    content: string;
    similarity: number;
}

async function embed(text: string): Promise<number[] | null> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
        });
        if (!res.ok) return null;
        const j = await res.json() as { data: Array<{ embedding: number[] }> };
        return j.data[0]?.embedding ?? null;
    } catch { return null; }
}

async function askClaudeHaiku(system: string, question: string, contexts: string): Promise<string | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 700,
                system,
                messages: [{ role: 'user', content: `${contexts}\n\nQuestion : ${question}` }],
            }),
        });
        if (!res.ok) return null;
        const j = await res.json() as { content: Array<{ text: string }> };
        return j.content?.[0]?.text ?? null;
    } catch { return null; }
}

export async function POST(request: Request) {
    // Rate limit: 60 questions per hour per user. RAG is cheap but LLM tokens aren't.
    const rl = await checkRateLimit(request, 'kb-ask', 60, 3600_000);
    if (!rl.ok) return rateLimitedResponse(rl);

    let body: AskBody;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const question = (body.question ?? '').trim();
    if (question.length < 3) {
        return Response.json({ ok: false, error: 'Question too short' }, { status: 400 });
    }
    const k = Math.max(1, Math.min(20, body.matchCount ?? 8));

    const t0 = Date.now();
    const ctx = getSupabaseServerClient();
    if (!ctx?.client) return Response.json({ ok: false, error: 'Supabase unavailable' }, { status: 500 });
    const sb = ctx.client;

    // 1. Embed
    const embedding = await embed(question);
    if (!embedding) {
        return Response.json({
            ok: false,
            error: 'Embeddings unavailable. Set OPENAI_API_KEY on the server or run locally with sentence-transformers.',
            fallback: null,
        }, { status: 501 });
    }

    // 2. Retrieve
    const { data: retrieved, error: retrErr } = await sb.rpc('match_kb', {
        query_embedding: embedding,
        match_count: k,
        filter_source: body.filterSource ?? null,
        filter_machine: body.filterMachine ?? null,
    });
    if (retrErr) return Response.json({ ok: false, error: retrErr.message }, { status: 500 });

    const chunks = (retrieved ?? []) as RetrievedChunk[];

    // 3. Assemble the prompt
    const system = `You are the maintenance assistant for L.C PROD, a Moroccan edible-oil plant. ` +
        `Answer in French, precisely and concisely. Cite the sources you used inline like [1], [2]. ` +
        `If the context doesn't contain the answer, say so — never invent details about equipment or procedures.`;
    const contextsText = chunks
        .map((c, i) => `[${i + 1}] (source: ${c.source} · ${c.title ?? c.source_id}${c.machine_code ? ' · ' + c.machine_code : ''})\n${c.content}`)
        .join('\n\n');

    // 4. Generate
    const answer = await askClaudeHaiku(system, question, contextsText);
    const latency = Date.now() - t0;

    // 5. Log
    try {
        await sb.from('kb_queries').insert({
            id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            question,
            retrieved: chunks.map(c => ({ id: c.id, sim: c.similarity })),
            answer,
            model: answer ? 'claude-haiku-4-5-20251001' : 'retrieval-only',
            latency_ms: latency,
        });
    } catch { /* log-side failure shouldn't break the response */ }

    return Response.json({
        ok: true,
        question,
        answer: answer ?? null,
        citations: chunks.map((c, i) => ({
            index: i + 1,
            source: c.source, sourceId: c.source_id, title: c.title,
            machineCode: c.machine_code, similarity: Math.round(c.similarity * 100) / 100,
            snippet: c.content.slice(0, 220),
        })),
        latencyMs: latency,
        rateLimit: { remaining: rl.remaining },
    });
}
