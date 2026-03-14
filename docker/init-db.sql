-- ============================================================================
-- OpenClaw Testing Platform — RuVector Database Initialization
-- ============================================================================
-- Creates the vector collections used by lib/vector-memory.js:
--   learnings  — bug patterns, test outcomes, agent learnings
--   decisions  — orchestrator decision history (Layer 3 cache)
--   patterns   — recurring QA patterns, test strategies
-- ============================================================================

-- Enable the RuVector extension
CREATE EXTENSION IF NOT EXISTS ruvector;

-- ── Learnings Collection ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learnings (
    id          TEXT PRIMARY KEY,
    embedding   VECTOR(384),
    text        TEXT,
    metadata    JSONB DEFAULT '{}',
    project_id  TEXT,
    task_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learnings_embedding
    ON learnings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_learnings_project
    ON learnings (project_id);

CREATE INDEX IF NOT EXISTS idx_learnings_task
    ON learnings (task_id);

-- ── Decisions Collection ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decisions (
    id          TEXT PRIMARY KEY,
    embedding   VECTOR(384),
    text        TEXT,
    metadata    JSONB DEFAULT '{}',
    project_id  TEXT,
    action      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_embedding
    ON decisions USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_decisions_project
    ON decisions (project_id);

-- ── Patterns Collection ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patterns (
    id          TEXT PRIMARY KEY,
    embedding   VECTOR(384),
    text        TEXT,
    metadata    JSONB DEFAULT '{}',
    project_id  TEXT,
    pattern_type TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_embedding
    ON patterns USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_patterns_project
    ON patterns (project_id);

CREATE INDEX IF NOT EXISTS idx_patterns_type
    ON patterns (pattern_type);

-- ── Helper function: cosine similarity search ────────────────────────────────

CREATE OR REPLACE FUNCTION search_similar(
    target_table TEXT,
    query_vector VECTOR(384),
    result_limit INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.75
)
RETURNS TABLE(id TEXT, similarity FLOAT, text TEXT, metadata JSONB)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY EXECUTE format(
        'SELECT id, 1 - (embedding <=> $1) AS similarity, text, metadata
         FROM %I
         WHERE 1 - (embedding <=> $1) >= $2
         ORDER BY embedding <=> $1
         LIMIT $3',
        target_table
    ) USING query_vector, min_similarity, result_limit;
END;
$$;
