-- Run on a disposable PostgreSQL database after migration 026. Fixtures roll back.
BEGIN;
INSERT INTO libraries(id, name, created_at) VALUES ('explicit_lib', 'Research', '2026-01-01');
INSERT INTO labs(id, name, created_at) VALUES ('explicit_lab', 'Lab', '2026-01-01'), ('explicit_no_members', 'Anonymous lab', '2026-01-01');
INSERT INTO authors(id, name, name_normalized, created_at) VALUES
    ('explicit_author', 'Jane', 'jane', '2026-01-01');
INSERT INTO papers(id, title, authors, year, venue, status, source, library_id, created_at)
SELECT 'explicit_p' || i, 'Paper ' || i, '[]'::jsonb, 2026, 'ICLR', 'read', 'human', 'explicit_lib', '2026-01-01'
FROM generate_series(1, 1105) i;
INSERT INTO paper_authors(id, paper_id, author_id, created_at)
SELECT 'explicit_pa' || i, 'explicit_p' || i, 'explicit_author', '2026-01-01' FROM generate_series(1, 1104) i;

DO $$
DECLARE result JSONB; batch TEXT[]; start_at INTEGER;
BEGIN
    PERFORM add_lab_member_only('explicit_lab', 'explicit_author');
    PERFORM add_lab_member_only('explicit_lab', 'explicit_author');
    IF (get_lab_members_page('explicit_lab')->>'total')::int <> 1 OR
       (get_lab_selected_papers_page('explicit_lab')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Membership must be idempotent and never add papers';
    END IF;
    IF (get_lab_papers_page('explicit_lab')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Old paper readers must also return explicit associations';
    END IF;
    IF (get_lab_paper_options('explicit_lab', '', 'explicit_author')->>'total')::int <> 1104 OR
       (get_lab_paper_options('explicit_lab')->>'total')::int <> 1105 THEN
        RAISE EXCEPTION 'Author picker must only show linked papers; direct picker must show all';
    END IF;
    result := add_lab_papers('explicit_lab', ARRAY['explicit_p1', 'explicit_p2'], 'explicit_author');
    IF (result->>'added_count')::int <> 2 THEN RAISE EXCEPTION 'Selected subset was not added'; END IF;
    IF (add_lab_papers('explicit_lab', ARRAY['explicit_p1', 'explicit_p1'])->>'added_count')::int <> 0 THEN
        RAISE EXCEPTION 'Duplicate additions must be idempotent';
    END IF;
    IF (get_lab_paper_options('explicit_lab', '', 'explicit_author')->>'total')::int <> 1102 THEN
        RAISE EXCEPTION 'Already associated papers must be excluded';
    END IF;
    IF (get_lab_paper_options('explicit_lab', '%')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Search wildcard must be literal';
    END IF;
    BEGIN
        PERFORM add_lab_papers('explicit_lab', ARRAY['explicit_p3', 'missing']);
        RAISE EXCEPTION 'Invalid paper accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    BEGIN
        PERFORM add_lab_papers('explicit_lab', ARRAY['explicit_p3', 'explicit_p1105'], 'explicit_author');
        RAISE EXCEPTION 'Unrelated paper accepted through author picker';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    IF (get_lab_selected_papers_page('explicit_lab')->>'total')::int <> 2 THEN
        RAISE EXCEPTION 'Failed selections must not be partially written';
    END IF;
    PERFORM add_lab_papers('explicit_no_members', ARRAY['explicit_p1105']);
    IF (get_lab_members_page('explicit_no_members')->>'total')::int <> 0 OR
       (get_lab_selected_papers_page('explicit_no_members')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Papers must work without members or documented authors';
    END IF;
    PERFORM remove_lab_member_only('explicit_lab', 'explicit_author');
    IF (get_lab_selected_papers_page('explicit_lab')->>'total')::int <> 2 THEN
        RAISE EXCEPTION 'Member removal must retain papers';
    END IF;
    DELETE FROM authors WHERE id = 'explicit_author';
    IF (get_lab_selected_papers_page('explicit_lab')->>'total')::int <> 2 THEN
        RAISE EXCEPTION 'Author deletion must retain paper links';
    END IF;
    DELETE FROM lab_paper_links WHERE lab_id = 'explicit_lab' AND paper_id = 'explicit_p1';
    IF NOT EXISTS (SELECT 1 FROM papers WHERE id = 'explicit_p1') OR
       (get_lab_selected_papers_page('explicit_lab')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Unlink must preserve paper';
    END IF;
    FOR start_at IN SELECT generate_series(1, 1105, 100) LOOP
        SELECT array_agg('explicit_p' || i) INTO batch FROM generate_series(start_at, least(start_at + 99, 1105)) i;
        PERFORM add_lab_papers('explicit_lab', batch);
    END LOOP;
    result := get_lab_selected_papers_page('explicit_lab', '', 25, 1100);
    IF (result->>'total')::int <> 1105 OR jsonb_array_length(result->'items') <> 5 THEN
        RAISE EXCEPTION 'Pagination beyond 1000 papers failed';
    END IF;
    IF (get_lab_selected_papers_page('explicit_lab', '', 25, 1200)->>'total')::int <> 1105 THEN
        RAISE EXCEPTION 'Past-end pagination lost total';
    END IF;
    DELETE FROM papers WHERE id = 'explicit_p1105';
    IF (get_lab_selected_papers_page('explicit_no_members')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Paper deletion must cascade explicit links';
    END IF;
    DELETE FROM labs WHERE id = 'explicit_lab';
    IF EXISTS (SELECT 1 FROM lab_paper_links WHERE lab_id = 'explicit_lab') OR
       (SELECT count(*) FROM papers WHERE id LIKE 'explicit_p%') <> 1104 THEN
        RAISE EXCEPTION 'Lab deletion must remove links and preserve papers';
    END IF;
    IF get_lab_selected_papers_page('missing') IS NOT NULL OR
       get_lab_paper_options('missing') IS NOT NULL OR
       add_lab_papers('missing', ARRAY['explicit_p1']) IS NOT NULL OR
       add_lab_member_only('missing', 'missing') IS NOT NULL OR
       remove_lab_member_only('missing', 'missing') THEN
        RAISE EXCEPTION 'Missing labs must return null/false';
    END IF;
END $$;
ROLLBACK;
