-- Run in disposable PostgreSQL after migration 029. Fixtures roll back.
BEGIN;
INSERT INTO public.labs(id, name, created_at) VALUES
    ('count_lab_a', 'Count A', '2026-01-01'), ('count_lab_b', 'Count B', '2026-01-01');
INSERT INTO public.papers(id, title, authors, year, created_at) VALUES
    ('count_p1', 'Paper one', '[]', 2026, '2026-01-01'),
    ('count_p2', 'Paper two', '[]', 2026, '2026-01-01');
DO $$
BEGIN
    IF (SELECT paper_count FROM public.lab_directory WHERE id = 'count_lab_a') <> 0 THEN
        RAISE EXCEPTION 'Empty lab must count zero';
    END IF;
    PERFORM public.add_lab_papers('count_lab_a', ARRAY['count_p1','count_p2']);
    PERFORM public.add_lab_papers('count_lab_a', ARRAY['count_p1']);
    PERFORM public.add_lab_papers('count_lab_b', ARRAY['count_p1']);
    IF (SELECT paper_count FROM public.lab_directory WHERE id = 'count_lab_a') <> 2
       OR (SELECT paper_count FROM public.lab_directory WHERE id = 'count_lab_b') <> 1 THEN
        RAISE EXCEPTION 'Counts must use unique explicit links per lab';
    END IF;
    DELETE FROM public.lab_paper_links WHERE lab_id = 'count_lab_a' AND paper_id = 'count_p2';
    IF (SELECT paper_count FROM public.lab_directory WHERE id = 'count_lab_a') <> 1 THEN
        RAISE EXCEPTION 'Count must reflect unlinking immediately';
    END IF;
    DELETE FROM public.papers WHERE id = 'count_p1';
    IF EXISTS (SELECT 1 FROM public.lab_directory WHERE id IN ('count_lab_a','count_lab_b') AND paper_count <> 0) THEN
        RAISE EXCEPTION 'Count must reflect source paper deletion';
    END IF;
END;
$$;
ROLLBACK;
