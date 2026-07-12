import { NextRequest, NextResponse } from 'next/server';

// HF Inference API — whisper-large-v3-turbo (best accuracy, runs on HF cloud)
const HF_URL = 'https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo';

export async function POST(req: NextRequest) {
    try {
        const wavBuffer = await req.arrayBuffer();
        if (wavBuffer.byteLength < 1000) return NextResponse.json({ text: '' });

        const token = process.env.HUGGINGFACE_TOKEN ?? '';
        const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const call = async () => fetch(HF_URL, {
            method: 'POST',
            headers,
            body: wavBuffer,
            signal: AbortSignal.timeout(30_000),
        });

        let res = await call();

        // Model cold-start: HF returns 503 with estimated_time
        if (res.status === 503) {
            const body = await res.json().catch(() => ({}));
            const wait = Math.min((body.estimated_time ?? 10) * 1000, 20_000);
            await new Promise(r => setTimeout(r, wait));
            res = await call();
        }

        if (res.ok) {
            const data = await res.json();
            const text = (data.text ?? '').trim();
            return NextResponse.json({ text });
        }

        // 401 (no token) or 429 (rate limit) → client falls back to local Whisper
        return NextResponse.json({ text: '' });

    } catch {
        return NextResponse.json({ text: '' });
    }
}
