-- Repair installations of the initial Labs migration that have the tables and
-- views but not the page RPCs. Safe to run after any version of 024_labs.sql.
-- Existing labs, memberships, authors, and papers are preserved.
BEGIN;

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
