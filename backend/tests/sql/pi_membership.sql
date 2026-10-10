-- Run in disposable PostgreSQL after migrations 024 through 028.
-- All fixtures roll back. Do not run against production.
BEGIN;
INSERT INTO public.authors(id, name, name_normalized, created_at) VALUES
    ('pi_member_a', 'Ada', 'ada', '2026-01-01'),
    ('pi_member_b', 'Bea', 'bea', '2026-01-01');
INSERT INTO public.papers(id, title, authors, year, created_at)
VALUES ('pi_member_p', 'Selected paper', '[]', 2026, '2026-01-01');

DO $$
DECLARE result JSONB;
BEGIN
    PERFORM public.save_lab_details('pi_member_lab', '{"name":"PI membership lab"}', '2026-01-01');
    result := public.add_lab_pi('pi_member_lab', 'pi_member_a');
    PERFORM public.add_lab_pi('pi_member_lab', 'pi_member_a');
    IF jsonb_array_length(result->'principal_investigators') <> 1
       OR (SELECT count(*) FROM public.lab_members WHERE lab_id = 'pi_member_lab') <> 1 THEN
        RAISE EXCEPTION 'PI addition must create one membership, including retries';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lab_paper_links WHERE lab_id = 'pi_member_lab') THEN
        RAISE EXCEPTION 'PI addition must leave paper selection explicit';
    END IF;

    -- Compatibility with clients that still send PI assignments in PATCH.
    PERFORM public.save_lab_details('pi_member_lab', '{"pi_author_ids":["pi_member_a","pi_member_b"]}');
    IF (SELECT count(*) FROM public.lab_members WHERE lab_id = 'pi_member_lab') <> 2 THEN
        RAISE EXCEPTION 'Legacy save path must also create PI memberships';
    END IF;
    PERFORM public.add_lab_papers('pi_member_lab', ARRAY['pi_member_p']);
    result := public.remove_lab_pi('pi_member_lab', 'pi_member_a');
    IF jsonb_array_length(result->'principal_investigators') <> 1
       OR NOT EXISTS (SELECT 1 FROM public.lab_members WHERE lab_id = 'pi_member_lab' AND author_id = 'pi_member_a')
       OR NOT EXISTS (SELECT 1 FROM public.lab_paper_links WHERE lab_id = 'pi_member_lab') THEN
        RAISE EXCEPTION 'PI removal must preserve other PIs, memberships and papers';
    END IF;
    PERFORM public.remove_lab_member_only('pi_member_lab', 'pi_member_b');
    IF EXISTS (SELECT 1 FROM public.lab_principal_investigators WHERE lab_id = 'pi_member_lab' AND author_id = 'pi_member_b') THEN
        RAISE EXCEPTION 'PI cannot remain without membership';
    END IF;
    BEGIN
        PERFORM public.add_lab_pi('pi_member_lab', 'missing_author');
        RAISE EXCEPTION 'Missing author accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    IF public.add_lab_pi('missing_lab', 'pi_member_a') IS NOT NULL
       OR public.remove_lab_pi('missing_lab', 'pi_member_a') IS NOT NULL THEN
        RAISE EXCEPTION 'Missing lab must return null';
    END IF;
    PERFORM public.add_lab_pi('pi_member_lab', 'pi_member_b');
    DELETE FROM public.authors WHERE id = 'pi_member_b';
    IF EXISTS (SELECT 1 FROM public.lab_members WHERE author_id = 'pi_member_b')
       OR EXISTS (SELECT 1 FROM public.lab_principal_investigators WHERE author_id = 'pi_member_b') THEN
        RAISE EXCEPTION 'Author deletion must cascade both roles';
    END IF;
    DELETE FROM public.labs WHERE id = 'pi_member_lab';
    IF NOT EXISTS (SELECT 1 FROM public.authors WHERE id = 'pi_member_a')
       OR NOT EXISTS (SELECT 1 FROM public.papers WHERE id = 'pi_member_p') THEN
        RAISE EXCEPTION 'Lab deletion must preserve source records';
    END IF;
END;
$$;
ROLLBACK;
