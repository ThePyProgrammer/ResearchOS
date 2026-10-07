-- Run after 009_authors.sql (and the existing libraries/papers migrations).
-- Labs, like authors, span libraries. Membership does not assert historical
-- affiliation: every paper linked to any current member is included.
BEGIN;

CREATE TABLE IF NOT EXISTS public.labs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    description TEXT CHECK (length(description) <= 5000),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lab_members (
    lab_id TEXT NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
    PRIMARY KEY (lab_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_labs_name_id ON public.labs (name, id);
CREATE INDEX IF NOT EXISTS idx_lab_members_author ON public.lab_members (author_id);
CREATE INDEX IF NOT EXISTS idx_paper_authors_author_paper ON public.paper_authors (author_id, paper_id);

-- Match the application's current, shared-workspace access model.
ALTER TABLE public.labs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_members DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.lab_member_details WITH (security_invoker = true) AS
SELECT lm.lab_id, a.id AS author_id, a.name, a.orcid
FROM public.lab_members lm
JOIN public.authors a ON a.id = lm.author_id;

-- Deduplicate IDs before joining paper metadata. No stored paper membership,
-- full-catalog transfer, or query per author is needed. PostgREST applies
-- lab/search filters, exact counts, ordering and pagination to this view.
CREATE OR REPLACE VIEW public.lab_papers WITH (security_invoker = true) AS
SELECT linked.lab_id, p.id, p.title, p.authors, p.year, p.venue, p.status,
       p.library_id, l.name AS library_name
FROM (
    SELECT DISTINCT lm.lab_id, pa.paper_id
    FROM public.lab_members lm
    JOIN public.paper_authors pa ON pa.author_id = lm.author_id
) linked
JOIN public.papers p ON p.id = linked.paper_id
LEFT JOIN public.libraries l ON l.id = p.library_id;

-- A bounded picker projection, excluding ALL existing members, not just the
-- currently visible page. SECURITY INVOKER preserves caller permissions.
CREATE OR REPLACE FUNCTION public.search_lab_member_options(
    p_lab_id TEXT, p_search TEXT, p_limit INTEGER DEFAULT 20
) RETURNS TABLE (author_id TEXT, name TEXT, orcid TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT a.id, a.name, a.orcid
    FROM public.authors a
    WHERE btrim(p_search) <> ''
      AND a.name ILIKE '%' || replace(replace(replace(btrim(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
      AND NOT EXISTS (
          SELECT 1 FROM public.lab_members lm
          WHERE lm.lab_id = p_lab_id AND lm.author_id = a.id
      )
    ORDER BY a.name, a.id
    LIMIT greatest(1, least(p_limit, 50));
$$;

-- Each page returns its count and existence result in ONE round trip, including
-- offsets past the last row. A missing lab is JSON null; an empty lab is a page.
CREATE OR REPLACE FUNCTION public.get_lab_members_page(
    p_lab_id TEXT, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'items', coalesce((
            SELECT jsonb_agg(to_jsonb(page) ORDER BY page.name, page.author_id)
            FROM (
                SELECT author_id, name, orcid FROM public.lab_member_details
                WHERE lab_id = p_lab_id ORDER BY name, author_id
                LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset)
            ) page
        ), '[]'::jsonb),
        'total', (SELECT count(*) FROM public.lab_members WHERE lab_id = p_lab_id),
        'limit', greatest(1, least(p_limit, 100)), 'offset', greatest(0, p_offset)
    ) FROM public.labs WHERE id = p_lab_id;
$$;

CREATE OR REPLACE FUNCTION public.get_lab_papers_page(
    p_lab_id TEXT, p_search TEXT DEFAULT '', p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH filtered AS MATERIALIZED (
        SELECT id, title, authors, year, venue, status, library_id, library_name
        FROM public.lab_papers
        WHERE lab_id = p_lab_id
          AND (btrim(p_search) = '' OR title ILIKE '%' || replace(replace(replace(btrim(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
    )
    SELECT jsonb_build_object(
        'items', coalesce((
            SELECT jsonb_agg(to_jsonb(page) ORDER BY page.year DESC, page.id)
            FROM (
                SELECT * FROM filtered ORDER BY year DESC, id
                LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset)
            ) page
        ), '[]'::jsonb),
        'total', (SELECT count(*) FROM filtered),
        'limit', greatest(1, least(p_limit, 100)), 'offset', greatest(0, p_offset)
    ) FROM public.labs WHERE id = p_lab_id;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
