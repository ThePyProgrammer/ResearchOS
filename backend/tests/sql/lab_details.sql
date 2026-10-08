-- Run in disposable PostgreSQL after migration 027. Fixtures roll back.
BEGIN;
INSERT INTO authors(id, name, name_normalized, created_at) VALUES
    ('details_a', 'Ada', 'ada', '2026-01-01'), ('details_b', 'Bea', 'bea', '2026-01-01');
INSERT INTO papers(id, title, authors, year, created_at)
VALUES ('details_p', 'Independent paper', '[]', 2026, '2026-01-01');

DO $$
DECLARE result JSONB;
BEGIN
    result := save_lab_details('details_lab', '{"name":"Details lab","websites":["https://example.org/","https://example.org/projects"],"pi_author_ids":["details_b","details_a","details_a"]}', '2026-01-01');
    IF jsonb_array_length(result->'principal_investigators') <> 2
       OR result->'principal_investigators'->0->>'name' <> 'Ada'
       OR jsonb_array_length(result->'websites') <> 2 THEN
        RAISE EXCEPTION 'Create must return websites and unique, ordered PIs';
    END IF;
    IF EXISTS (SELECT 1 FROM lab_members WHERE lab_id = 'details_lab')
       OR EXISTS (SELECT 1 FROM lab_paper_links WHERE lab_id = 'details_lab') THEN
        RAISE EXCEPTION 'PI assignment must not create members or papers';
    END IF;
    PERFORM add_lab_member_only('details_lab', 'details_a');
    PERFORM add_lab_papers('details_lab', ARRAY['details_p']);
    result := save_lab_details('details_lab', '{"description":"Edited"}');
    IF jsonb_array_length(result->'websites') <> 2 OR jsonb_array_length(result->'principal_investigators') <> 2 THEN
        RAISE EXCEPTION 'Omitted arrays must be preserved';
    END IF;
    BEGIN
        PERFORM save_lab_details('details_lab', '{"name":"Must roll back","websites":[],"pi_author_ids":["details_a","missing"]}');
        RAISE EXCEPTION 'Missing PI accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    SELECT to_jsonb(d) INTO result FROM lab_details d WHERE id = 'details_lab';
    IF result->>'name' <> 'Details lab' OR jsonb_array_length(result->'websites') <> 2
       OR jsonb_array_length(result->'principal_investigators') <> 2 THEN
        RAISE EXCEPTION 'Invalid PI must roll back the entire save';
    END IF;
    BEGIN
        PERFORM save_lab_details('details_failed', '{"name":"Must roll back","pi_author_ids":["missing"]}', '2026-01-01');
        RAISE EXCEPTION 'Invalid create accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    IF EXISTS (SELECT 1 FROM labs WHERE id = 'details_failed') THEN RAISE EXCEPTION 'Failed create left a lab'; END IF;
    result := save_lab_details('details_lab', '{"websites":[],"pi_author_ids":[]}');
    IF result->'websites' <> '[]'::jsonb OR result->'principal_investigators' <> '[]'::jsonb
       OR (get_lab_members_page('details_lab')->>'total')::int <> 1
       OR (get_lab_selected_papers_page('details_lab')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Clearing details must preserve members and papers';
    END IF;
    IF save_lab_details('details_missing', '{}') IS NOT NULL THEN RAISE EXCEPTION 'Missing lab must return null'; END IF;
    PERFORM save_lab_details('details_lab', '{"pi_author_ids":["details_a","details_b"]}');
    UPDATE authors SET name = 'Renamed' WHERE id = 'details_a';
    IF NOT EXISTS (SELECT 1 FROM lab_details, jsonb_array_elements(principal_investigators) pi
                   WHERE id = 'details_lab' AND pi->>'name' = 'Renamed') THEN
        RAISE EXCEPTION 'PI names must reflect current author profiles';
    END IF;
    DELETE FROM authors WHERE id = 'details_a';
    IF (SELECT jsonb_array_length(principal_investigators) FROM lab_details WHERE id = 'details_lab') <> 1
       OR (get_lab_selected_papers_page('details_lab')->>'total')::int <> 1 THEN
        RAISE EXCEPTION 'Author deletion must remove only its relationships';
    END IF;
    DELETE FROM labs WHERE id = 'details_lab';
    IF EXISTS (SELECT 1 FROM lab_principal_investigators WHERE lab_id = 'details_lab')
       OR NOT EXISTS (SELECT 1 FROM authors WHERE id = 'details_b')
       OR NOT EXISTS (SELECT 1 FROM papers WHERE id = 'details_p') THEN
        RAISE EXCEPTION 'Lab deletion must preserve source authors and papers';
    END IF;
END;
$$;
ROLLBACK;
