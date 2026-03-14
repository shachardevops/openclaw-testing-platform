-- ============================================================================
-- OpenClaw Testing Platform — RuVector Database Initialization
-- ============================================================================
-- Creates the vector collections used by lib/vector-memory.js:
--   learnings  — bug patterns, test outcomes, agent learnings
--   decisions  — orchestrator decision history (Layer 3 cache)
--   patterns   — recurring QA patterns, test strategies
--
-- Known RuVector edge cases handled:
--   #175  — Docker image may be missing ruvector--2.0.0.sql. The DO block
--           below detects this and falls back gracefully.
--   #152  — HNSW errors on non-vector queries (COUNT, IS NOT NULL).
--           Fixed in v2.0.2+. safe_count() provides a fallback.
--   #171  — HNSW returns fewer results on small tables. The search_similar
--           function uses explicit ORDER BY for deterministic results.
--   #164  — HNSW segfault on large tables (>100K rows) in pre-2.0.2.
--           rebuild_all_indexes() helper for post-upgrade REINDEX.
--   #167  — ruvector_list_agents/ruvector_sparql_json crash PG backend.
--           We avoid calling these functions; use standard SQL only.
-- ============================================================================

-- ── Extension Installation (with #175 guard) ────────────────────────────────
-- The ruvector Docker image has had packaging bugs where the SQL install
-- script was missing (#175). We try to install gracefully and report status.

DO $$
BEGIN
    -- Try creating the extension
    BEGIN
        CREATE EXTENSION IF NOT EXISTS ruvector;
        RAISE NOTICE 'RuVector extension installed successfully';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'RuVector extension install failed: %. '
            'This may be #175 (missing SQL file). '
            'Verify Docker image is v2.0.3+. '
            'Tables will be created without HNSW indexes.', SQLERRM;
    END;
END;
$$;

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

-- HNSW index — may fail if extension not loaded (#175)
DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_learnings_embedding
        ON learnings USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'HNSW index creation failed for learnings: %', SQLERRM;
END;
$$;

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

DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_decisions_embedding
        ON decisions USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'HNSW index creation failed for decisions: %', SQLERRM;
END;
$$;

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

DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_patterns_embedding
        ON patterns USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'HNSW index creation failed for patterns: %', SQLERRM;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_patterns_project
    ON patterns (project_id);

CREATE INDEX IF NOT EXISTS idx_patterns_type
    ON patterns (pattern_type);

-- ── Helper: cosine similarity search ─────────────────────────────────────────
-- Uses explicit ORDER BY to avoid #171 (non-deterministic result ordering).
-- Uses LIMIT at the SQL level to avoid returning unbounded results.

CREATE OR REPLACE FUNCTION search_similar(
    target_table TEXT,
    query_vector VECTOR(384),
    result_limit INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.75
)
RETURNS TABLE(id TEXT, similarity FLOAT, text TEXT, metadata JSONB)
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate table name to prevent SQL injection
    IF target_table NOT IN ('learnings', 'decisions', 'patterns') THEN
        RAISE EXCEPTION 'Invalid table name: %', target_table;
    END IF;

    RETURN QUERY EXECUTE format(
        'SELECT id, 1 - (embedding <=> $1) AS similarity, text, metadata
         FROM %I
         WHERE embedding IS NOT NULL
           AND 1 - (embedding <=> $1) >= $2
         ORDER BY embedding <=> $1 ASC
         LIMIT $3',
        target_table
    ) USING query_vector, min_similarity, result_limit;
END;
$$;

-- ── Helper: safe_count — workaround for #152 ────────────────────────────────
-- HNSW indexes in pre-2.0.2 crash on COUNT(*) and WHERE embedding IS NOT NULL.
-- This function disables index scan before counting, then restores the setting.

CREATE OR REPLACE FUNCTION safe_count(target_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    row_count BIGINT;
BEGIN
    IF target_table NOT IN ('learnings', 'decisions', 'patterns') THEN
        RAISE EXCEPTION 'Invalid table name: %', target_table;
    END IF;

    -- Try normal count first (works in v2.0.2+)
    BEGIN
        EXECUTE format('SELECT COUNT(*) FROM %I', target_table) INTO row_count;
        RETURN row_count;
    EXCEPTION WHEN OTHERS THEN
        -- #152 — Fall back to disabling index scan
        SET LOCAL enable_indexscan = off;
        EXECUTE format('SELECT COUNT(*) FROM %I', target_table) INTO row_count;
        SET LOCAL enable_indexscan = on;
        RETURN row_count;
    END;
END;
$$;

-- ── Helper: rebuild_all_indexes ──────────────────────────────────────────────
-- After upgrading ruvector-postgres (especially to 2.0.2+ fixing #171/#164),
-- HNSW indexes must be rebuilt to use correct dimension metadata.
-- Run: SELECT rebuild_all_indexes();

CREATE OR REPLACE FUNCTION rebuild_all_indexes()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    idx RECORD;
    rebuilt INT := 0;
BEGIN
    FOR idx IN
        SELECT indexname FROM pg_indexes
        WHERE tablename IN ('learnings', 'decisions', 'patterns')
          AND indexname LIKE '%embedding%'
    LOOP
        BEGIN
            EXECUTE format('REINDEX INDEX %I', idx.indexname);
            rebuilt := rebuilt + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to reindex %: %', idx.indexname, SQLERRM;
        END;
    END LOOP;

    RETURN format('Rebuilt %s HNSW indexes', rebuilt);
END;
$$;

-- ── Helper: collection_stats ─────────────────────────────────────────────────
-- Returns row counts and index status for monitoring dashboards (Grafana).

CREATE OR REPLACE FUNCTION collection_stats()
RETURNS TABLE(collection TEXT, row_count BIGINT, has_hnsw BOOLEAN, oldest TIMESTAMPTZ, newest TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 'learnings'::TEXT,
           safe_count('learnings'),
           EXISTS(SELECT 1 FROM pg_indexes WHERE tablename='learnings' AND indexname LIKE '%embedding%'),
           (SELECT MIN(created_at) FROM learnings),
           (SELECT MAX(created_at) FROM learnings);

    RETURN QUERY
    SELECT 'decisions'::TEXT,
           safe_count('decisions'),
           EXISTS(SELECT 1 FROM pg_indexes WHERE tablename='decisions' AND indexname LIKE '%embedding%'),
           (SELECT MIN(created_at) FROM decisions),
           (SELECT MAX(created_at) FROM decisions);

    RETURN QUERY
    SELECT 'patterns'::TEXT,
           safe_count('patterns'),
           EXISTS(SELECT 1 FROM pg_indexes WHERE tablename='patterns' AND indexname LIKE '%embedding%'),
           (SELECT MIN(created_at) FROM patterns),
           (SELECT MAX(created_at) FROM patterns);
END;
$$;

-- ── Health check table ───────────────────────────────────────────────────────
-- Records extension version and init status for monitoring.

CREATE TABLE IF NOT EXISTS _ruvector_health (
    check_time  TIMESTAMPTZ DEFAULT NOW(),
    extension_version TEXT,
    pg_version  TEXT,
    hnsw_available BOOLEAN DEFAULT FALSE,
    init_warnings TEXT[]
);

DO $$
DECLARE
    ext_ver TEXT;
    hnsw_ok BOOLEAN := FALSE;
BEGIN
    -- Get extension version if installed
    SELECT extversion INTO ext_ver
    FROM pg_extension WHERE extname = 'ruvector';

    -- Check if HNSW is available by looking for the operator class
    SELECT EXISTS(
        SELECT 1 FROM pg_opclass WHERE opcname = 'vector_cosine_ops'
    ) INTO hnsw_ok;

    INSERT INTO _ruvector_health (extension_version, pg_version, hnsw_available)
    VALUES (COALESCE(ext_ver, 'NOT INSTALLED'), version(), hnsw_ok);

    IF ext_ver IS NULL THEN
        RAISE WARNING 'RuVector extension not installed — vector search will use sequential scan';
    ELSIF ext_ver < '2.0.2' THEN
        RAISE WARNING 'RuVector version % detected. Upgrade to 2.0.2+ recommended '
            'to fix #152 (COUNT crash), #164 (segfault), #171 (result limit bug)', ext_ver;
    END IF;
END;
$$;
