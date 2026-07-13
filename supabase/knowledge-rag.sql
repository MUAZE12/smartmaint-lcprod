-- ============================================================
-- knowledge-rag.sql
--
-- Enables retrieval-augmented Q/A over the plant's own history:
-- knowledge articles + closed intervention reports. Ships a
-- pgvector column, a HNSW index for fast ANN, and a match_kb
-- RPC that returns the top-K neighbours for a query embedding.
--
-- HOW IT IS USED
--   1. Client computes an embedding for the question.
--   2. Client calls RPC match_kb(query embedding, k=8).
--   3. Client passes the 8 chunks + question to an LLM as context.
--
-- IDEMPOTENT - safe to re-run.
-- REQUIRES: the "vector" extension enabled from the Supabase dashboard.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE IF NOT EXISTS kb_embeddings (
    id           text PRIMARY KEY,
    source       text NOT NULL,
    source_id    text NOT NULL,
    chunk_index  integer NOT NULL,
    content      text NOT NULL,
    title        text,
    machine_code text,
    metadata     jsonb,
    embedding    vector(1536),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS kb_embeddings_source_idx  ON kb_embeddings (source);
CREATE INDEX IF NOT EXISTS kb_embeddings_machine_idx ON kb_embeddings (machine_code);

-- HNSW = state-of-the-art ANN index for pgvector.
CREATE INDEX IF NOT EXISTS kb_embeddings_vec_hnsw
    ON kb_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- RLS: permissive read for authed users, write only via service_role
ALTER TABLE kb_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_embeddings_read"  ON kb_embeddings;
DROP POLICY IF EXISTS "kb_embeddings_write" ON kb_embeddings;

CREATE POLICY "kb_embeddings_read" ON kb_embeddings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "kb_embeddings_write" ON kb_embeddings FOR ALL
    USING ((SELECT rolname FROM pg_roles WHERE oid = session_user::regrole) = 'service_role')
    WITH CHECK (true);

GRANT SELECT ON kb_embeddings TO anon, authenticated;
GRANT ALL    ON kb_embeddings TO service_role;

-- Similarity search RPC
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

-- Audit: track queries so we can improve retrieval later
CREATE TABLE IF NOT EXISTS kb_queries (
    id           text PRIMARY KEY,
    user_id      text,
    question     text NOT NULL,
    retrieved    jsonb,
    answer       text,
    model        text,
    latency_ms   integer,
    rated        smallint,
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
