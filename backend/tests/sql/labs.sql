-- Isolated SQL regression test. Apply schema.sql (tables only) and 024_labs.sql
-- to a disposable PostgreSQL database, then run this file. Fixtures roll back.
BEGIN;
INSERT INTO libraries(id, name, created_at) VALUES ('test_lab_lib', 'Lab library', '2026-01-01');
INSERT INTO authors(id, name, name_normalized, created_at) VALUES
    ('test_lab_a', 'Jane 50%_Lab', 'jane lab', '2026-01-01'),
    ('test_lab_b', 'John Smith', 'john smith', '2026-01-01'),
    ('test_lab_c', 'John Jones', 'john jones', '2026-01-01');
INSERT INTO labs(id, name, created_at) VALUES
    ('test_lab_1', 'Lab one', '2026-01-01'), ('test_lab_2', 'Lab two', '2026-01-01');
INSERT INTO lab_members(lab_id, author_id) VALUES
    ('test_lab_1', 'test_lab_a'), ('test_lab_1', 'test_lab_b'), ('test_lab_2', 'test_lab_a');
INSERT INTO papers(id, title, authors, year, venue, status, source, library_id, created_at)
SELECT 'test_lab_p' || i, 'Paper ' || i, '["Jane", "John"]'::jsonb, 2026, 'ICLR', 'read', 'human', 'test_lab_lib', '2026-01-01'
FROM generate_series(1, 1105) i;
INSERT INTO paper_authors(id, paper_id, author_id, created_at)
SELECT 'test_lab_pa' || i, 'test_lab_p' || i, 'test_lab_a', '2026-01-01' FROM generate_series(1, 1105) i;
INSERT INTO paper_authors(id, paper_id, author_id, created_at)
VALUES ('test_lab_shared', 'test_lab_p1', 'test_lab_b', '2026-01-01');

DO $$
DECLARE page JSONB;
BEGIN
    IF (SELECT count(*) FROM lab_papers WHERE lab_id = 'test_lab_1') <> 1105 THEN
        RAISE EXCEPTION 'Shared papers must be deduplicated';
    END IF;
    page := get_lab_papers_page('test_lab_1', '', 25, 1100);
    IF (page->>'total')::int <> 1105 OR jsonb_array_length(page->'items') <> 5 THEN
        RAISE EXCEPTION 'Pagination beyond the PostgREST row cap must remain complete';
    END IF;
    IF page->'items'->0->>'library_name' <> 'Lab library' THEN
        RAISE EXCEPTION 'Library metadata must be included';
    END IF;
    IF get_lab_papers_page('missing') IS NOT NULL THEN RAISE EXCEPTION 'Missing lab must be null'; END IF;
    IF get_lab_members_page('missing') IS NOT NULL THEN RAISE EXCEPTION 'Missing members must be null'; END IF;
    IF (get_lab_papers_page('test_lab_1', '', 25, 1200)->>'total')::int <> 1105 THEN
        RAISE EXCEPTION 'Past-end pages must retain the total';
    END IF;
    IF (get_lab_papers_page('test_lab_1', 'Paper 1105')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Paper search must run before count/pagination';
    END IF;
    IF (get_lab_papers_page('test_lab_1', '%')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Search wildcards must be literal';
    END IF;
    IF (SELECT count(*) FROM search_lab_member_options('test_lab_1', 'John')) <> 1 THEN
        RAISE EXCEPTION 'Picker must exclude current members';
    END IF;
    IF (SELECT count(*) FROM search_lab_member_options('missing', '50%_')) <> 1 THEN
        RAISE EXCEPTION 'Picker must escape wildcard characters';
    END IF;
    IF (get_lab_members_page('test_lab_1', 1, 1)->>'total')::int <> 2 THEN
        RAISE EXCEPTION 'Member pagination must retain total';
    END IF;
    BEGIN
        INSERT INTO lab_members VALUES ('test_lab_1', 'test_lab_a');
        RAISE EXCEPTION 'Duplicate membership accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO lab_members VALUES ('test_lab_1', 'missing');
        RAISE EXCEPTION 'Missing author accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
END $$;

DELETE FROM lab_members WHERE lab_id = 'test_lab_1' AND author_id = 'test_lab_a';
DO $$ BEGIN
    IF (get_lab_papers_page('test_lab_1')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Removing one coauthor must retain the shared paper';
    END IF;
    IF (get_lab_papers_page('test_lab_2')->>'total')::int <> 1105 THEN
        RAISE EXCEPTION 'Membership removal must not affect other labs';
    END IF;
END $$;
DELETE FROM authors WHERE id = 'test_lab_b';
DO $$ BEGIN
    IF (get_lab_papers_page('test_lab_1')->>'total')::int <> 0 THEN
        RAISE EXCEPTION 'Author deletion must cascade memberships';
    END IF;
END $$;
DELETE FROM labs WHERE id = 'test_lab_2';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM authors WHERE id = 'test_lab_a') OR
       (SELECT count(*) FROM papers WHERE id LIKE 'test_lab_p%') <> 1105 THEN
        RAISE EXCEPTION 'Deleting labs must preserve authors and papers';
    END IF;
    IF EXISTS (SELECT 1 FROM lab_members WHERE lab_id = 'test_lab_2') THEN
        RAISE EXCEPTION 'Lab deletion must cascade memberships';
    END IF;
END $$;
ROLLBACK;
