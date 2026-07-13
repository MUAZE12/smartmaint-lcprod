-- ============================================================
-- knowledge-rag.sql
--
-- Enables retrieval-augmented Q&A over the plant's own history:
-- knowledge articles + closed intervention reports. Ships a
-- pgvector column, a HNSW index for fast ANN, and a `match_kb`
-- RPC that returns the top-K neighbours for a query embedding.
--
-- HOW IT'S USED
--   1. Client computes an embedding for the question (Claude API,
--      OpenAI, or local sentence-transformers).
--   2. Client calls RPC `match_kb(query embedding, k=8)`.
--   3. Client passes the 8 chunks + question to Claude Haiku / GPT
--      as context and streams the answer back.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Embeddings table ─────────────────────────────────────
-- Note: we ALSO store the source text so the client can render the
-- exact quote it grounded on. Embeddings-only would force a second
-- lookup per hit.
CREATE TABLE IF NOT EXISTS kb_embeddings (
    id           text PRIMARY KEY,
    source       text NOT NULL,       -- 'knowledge' | 'intervention' | 'procedure' | 'haccp'
    source_id    text NOT NULL,       -- FK to the row it was extracted from
    chunk_index  integer NOT NULL,    -- 0-based within the source
    content      text NOT NULL,       -- the ~400-token chunk itself
    title        text,                -- source title for citations
    machine_code text,                -- if the chunk mentions a specific machine
    metadata     jsonb,               -- free-form tags: workshop, criticality, author
    embedding    vector(1536),        -- OpenAI text-embedding-3-small dim
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS kb_embeddings_source_idx  ON kb_embeddings (source);
CREATE INDEX IF NOT EXISTS kb_embeddings_machine_idx ON kb_embeddings (machine_code);

-- HNSW = state-of-the-art ANN index for pgvector. Cosine distance
-- because OpenAI embeddings are already normalized.
CREATE INDEX IF NOT EXISTS kb_embeddings_vec_hnsw
    ON kb_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ── RLS: permissive read for authed users, write only via server ──
ALTER TABLE kb_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_embeddings_read"  ON kb_embeddings;
DROP POLICY IF EXISTS "kb_embeddings_write" ON kb_embeddings;

CREATE POLICY "kb_embeddings_read"  ON kb_embeddings FOR SELECT USING (auth.uid() IS NOT NULL);
-- Writes happen via service_role only (the /api/kb/embed cron uses it).
CREATE POLICY "kb_embeddings_write" ON kb_embeddings FOR ALL
    USING ((SELECT rolname FROM pg_roles WHERE oid = session_user::regrole) = 'service_role')
    WITH CHECK (true);

GRANT SELECT ON kb_embeddings TO anon, authenticated;
GRANT ALL    ON kb_embeddings TO service_role;

-- ── Similarity search RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION match_kb(
    query_embedding vector(1536),
    match_count int DEFAULT 8,
    filter_source text DEFAULT NULL,
    filter_machine text DEFAULT NULL
)
RETURNS TABLE (
    id text,
    source text,
    source_id text,
    chunk_index int,
    content text,
    title text,
    machine_code text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE AS $$
    SELECT
        e.id, e.source, e.source_id, e.chunk_index,
        e.content, e.title, e.machine_code, e.metadata,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM kb_embeddings e
    WHERE (filter_source  IS NULL OR e.source = filter_source)
      AND (filter_machine IS NULL OR e.machine_code = filter_machine)
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_kb(vector, int, text, text) TO anon, authenticated, service_role;

-- ── Audit: track queries so we can improve the retrieval later ──
CREATE TABLE IF NOT EXISTS kb_queries (
    id           text PRIMARY KEY,
    user_id      text,
    question     text NOT NULL,
    retrieved    jsonb,                     -- ids + similarities of the k neighbours
    answer       text,                      -- LLM answer (nullable if streaming failed)
    model        text,                      -- 'claude-haiku' | 'gpt-4o-mini' | ...
    latency_ms   integer,
    rated        smallint,                  -- -1 / 0 / +1 thumbs
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_queries_created_idx ON kb_queries (created_at DESC);

ALTER TABLE kb_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kb_queries_write" ON kb_queries;
DROP POLICY IF EXISTS "kb_queries_read"  ON kb_queries;
CREATE POLICY "kb_queries_write" ON kb_queries FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "kb_queries_read"  ON kb_queries FOR SELECT USING (auth.uid() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE ON kb_queries TO anon, authenticated, service_role;

COMMIT;
