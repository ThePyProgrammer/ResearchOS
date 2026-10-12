-- Run in disposable PostgreSQL after migration 032. Fixtures roll back.
BEGIN;
INSERT INTO public.authors(id, name, name_normalized, affiliations, created_at)
SELECT 'page_' || i, 'Pagination ' || lpad(i::text, 3, '0'), 'pagination ' || i,
       '[{"institution":"Pagination Test Institute"}]'::jsonb, '2026-01-01'
FROM generate_series(1, 258) i;
DO $$
BEGIN
    IF (SELECT count(*) FROM public.search_author_profiles('Pagination Test Institute', 'institute pagination test', 51)) <> 51 THEN
        RAISE EXCEPTION 'Existing three-argument calls must remain supported';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('Pagination Test Institute', 'institute pagination test', 51, 250))
       IS DISTINCT FROM ARRAY['page_251','page_252','page_253','page_254','page_255','page_256','page_257','page_258'] THEN
        RAISE EXCEPTION 'Affiliation search must paginate beyond 200 matches';
    END IF;
    IF EXISTS (SELECT 1 FROM public.search_author_profiles('Pagination Test Institute', 'institute pagination test', 51, 258)) THEN
        RAISE EXCEPTION 'Offsets past the last match must return no authors';
    END IF;
END;
$$;
ROLLBACK;
