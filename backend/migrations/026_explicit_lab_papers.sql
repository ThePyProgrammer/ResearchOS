-- Run after 024_labs.sql and 025_lab_page_functions.sql.
-- Membership and paper association are now independent. No papers are inferred
-- or backfilled from members. Every association requires an explicit selection.
-- Existing explicit links are preserved when rerunning this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lab_paper_links (
    lab_id TEXT NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (lab_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_lab_paper_links_paper ON public.lab_paper_links (paper_id);
ALTER TABLE public.lab_paper_links DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.lab_selected_papers WITH (security_invoker = true) AS
SELECT lp.lab_id, p.id, p.title, p.authors, p.year, p.venue, p.status,
       p.library_id, l.name AS library_name
FROM public.lab_paper_links lp
JOIN public.papers p ON p.id = lp.paper_id
LEFT JOIN public.libraries l ON l.id = p.library_id;

-- Keep older page functions/readers consistent after the migration too.
CREATE OR REPLACE VIEW public.lab_papers WITH (security_invoker = true) AS
SELECT * FROM public.lab_selected_papers;

-- The new name prevents newer application code from silently using the old
-- automatic-membership semantics if this migration has not been applied.
CREATE OR REPLACE FUNCTION public.get_lab_selected_papers_page(
    p_lab_id TEXT, p_search TEXT DEFAULT '', p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH filtered AS MATERIALIZED (
        SELECT id, title, authors, year, venue, status, library_id, library_name
        FROM public.lab_selected_papers
        WHERE lab_id = p_lab_id
          AND (btrim(p_search) = '' OR title ILIKE '%' || replace(replace(replace(btrim(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
    )
    SELECT jsonb_build_object(
        'items', coalesce((
            SELECT jsonb_agg(to_jsonb(page) ORDER BY page.year DESC, page.id)
            FROM (SELECT * FROM filtered ORDER BY year DESC, id
                  LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset)) page
        ), '[]'::jsonb),
        'total', (SELECT count(*) FROM filtered),
        'limit', greatest(1, least(p_limit, 100)), 'offset', greatest(0, p_offset)
    ) FROM public.labs WHERE id = p_lab_id;
$$;

CREATE OR REPLACE FUNCTION public.get_lab_paper_options(
    p_lab_id TEXT, p_search TEXT DEFAULT '', p_author_id TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH filtered AS MATERIALIZED (
        SELECT p.id, p.title, p.authors, p.year, p.venue, p.status, p.library_id,
               l.name AS library_name
        FROM public.papers p
        LEFT JOIN public.libraries l ON l.id = p.library_id
        WHERE NOT EXISTS (
            SELECT 1 FROM public.lab_paper_links lp WHERE lp.lab_id = p_lab_id AND lp.paper_id = p.id
        )
          AND (p_author_id IS NULL OR EXISTS (
              SELECT 1 FROM public.paper_authors pa WHERE pa.paper_id = p.id AND pa.author_id = p_author_id
          ))
          AND (btrim(p_search) = '' OR p.title ILIKE '%' || replace(replace(replace(btrim(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
    )
    SELECT jsonb_build_object(
        'items', coalesce((
            SELECT jsonb_agg(to_jsonb(page) ORDER BY page.year DESC, page.id)
            FROM (SELECT * FROM filtered ORDER BY year DESC, id
                  LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset)) page
        ), '[]'::jsonb),
        'total', (SELECT count(*) FROM filtered),
        'limit', greatest(1, least(p_limit, 100)), 'offset', greatest(0, p_offset)
    ) FROM public.labs WHERE id = p_lab_id;
$$;

CREATE OR REPLACE FUNCTION public.add_lab_papers(
    p_lab_id TEXT, p_paper_ids TEXT[], p_author_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE inserted_count INTEGER;
BEGIN
    PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR KEY SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_paper_ids IS NULL OR cardinality(p_paper_ids) NOT BETWEEN 1 AND 100
       OR array_position(p_paper_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Select between 1 and 100 papers.' USING ERRCODE = '22023';
    END IF;
    -- Hold referenced papers through the insert; validate the entire selection
    -- before writing anything so a deleted/invalid ID cannot cause a partial add.
    PERFORM 1 FROM public.papers WHERE id = ANY(p_paper_ids) FOR KEY SHARE;
    IF EXISTS (SELECT 1 FROM unnest(p_paper_ids) requested(id)
               WHERE NOT EXISTS (SELECT 1 FROM public.papers p WHERE p.id = requested.id)) THEN
        RAISE EXCEPTION 'One or more selected papers no longer exist.' USING ERRCODE = 'P0002';
    END IF;
    IF p_author_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(p_paper_ids) requested(id) WHERE NOT EXISTS (
            SELECT 1 FROM public.paper_authors pa
            WHERE pa.paper_id = requested.id AND pa.author_id = p_author_id
        )
    ) THEN
        RAISE EXCEPTION 'Select papers linked to the chosen author.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lab_paper_links(lab_id, paper_id)
    SELECT p_lab_id, id FROM unnest(p_paper_ids) requested(id)
    ON CONFLICT (lab_id, paper_id) DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN jsonb_build_object('added_count', inserted_count);
END;
$$;

-- Versioned member mutations also fail clearly on an unmigrated database,
-- rather than triggering the previous automatic-paper behavior.
CREATE OR REPLACE FUNCTION public.add_lab_member_only(p_lab_id TEXT, p_author_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE member JSONB;
BEGIN
    PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR KEY SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT jsonb_build_object('author_id', id, 'name', name, 'orcid', orcid)
    INTO member FROM public.authors WHERE id = p_author_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Author not found' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.lab_members(lab_id, author_id) VALUES (p_lab_id, p_author_id)
    ON CONFLICT (lab_id, author_id) DO NOTHING;
    RETURN member;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_lab_member_only(p_lab_id TEXT, p_author_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR KEY SHARE;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    DELETE FROM public.lab_members WHERE lab_id = p_lab_id AND author_id = p_author_id;
    RETURN TRUE;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
