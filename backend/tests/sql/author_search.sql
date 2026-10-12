-- Run in disposable PostgreSQL after migration 031. Fixtures roll back.
BEGIN;
INSERT INTO public.authors(id, name, name_normalized, affiliations, created_at) VALUES
    ('search_a', 'Search Alice', 'alice search', '[]', '2026-01-01'),
    ('search_b', 'Search Bob', 'bob search', '[{"institution":"Search Old Institute","end_date":"2020"},{"institution":"Search Current University"}]', '2026-01-01'),
    ('search_c', 'Search Carol', 'carol search', '[]', '2026-01-01'),
    ('search_d', 'Search Dave', 'dave search', '[]', '2026-01-01');
INSERT INTO public.labs(id, name, created_at) VALUES
    ('search_lab', 'Search Vision Lab', '2026-01-01'),
    ('search_special', 'Search 100%_Lab', '2026-01-01');
INSERT INTO public.lab_members(lab_id, author_id) VALUES
    ('search_lab', 'search_c'), ('search_special', 'search_d');
INSERT INTO public.lab_principal_investigators(lab_id, author_id) VALUES
    ('search_lab', 'search_c'), ('search_lab', 'search_d');
DO $$
BEGIN
    IF (SELECT array_agg(id) FROM public.search_author_profiles('Search, Alice', 'alice search', 50)) IS DISTINCT FROM ARRAY['search_a'] THEN
        RAISE EXCEPTION 'Normalized name matching must be preserved';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('  OLD INSTITUTE  ', 'institute old', 50)) IS DISTINCT FROM ARRAY['search_b'] THEN
        RAISE EXCEPTION 'Historical affiliations must match case-insensitively';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('current university', 'current university', 50)) IS DISTINCT FROM ARRAY['search_b'] THEN
        RAISE EXCEPTION 'Current affiliations must match';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('VISION LAB', 'lab vision', 50)) IS DISTINCT FROM ARRAY['search_c', 'search_d'] THEN
        RAISE EXCEPTION 'Member and PI matches must be unique and ordered';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('Vision Lab', 'lab vision', 1)) IS DISTINCT FROM ARRAY['search_c'] THEN
        RAISE EXCEPTION 'Limit must apply after matching';
    END IF;
    IF (SELECT array_agg(id) FROM public.search_author_profiles('%_', '', 50)) IS DISTINCT FROM ARRAY['search_d'] THEN
        RAISE EXCEPTION 'Search metacharacters must match literally';
    END IF;
    IF EXISTS (SELECT 1 FROM public.search_author_profiles('no_such_search_fixture', 'no_such_search_fixture', 50)) THEN
        RAISE EXCEPTION 'Unmatched queries must return no authors';
    END IF;
END;
$$;
ROLLBACK;
