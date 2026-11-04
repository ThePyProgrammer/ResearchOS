-- Run after migration 033 on a disposable database. All fixture data rolls back.
BEGIN;
INSERT INTO libraries(id,name,created_at) VALUES ('cite_lib','Citations','2026-11-03'),('cite_other','Other','2026-11-03');
INSERT INTO papers(id,title,authors,year,venue,status,source,library_id,created_at,doi) VALUES
 ('cite_a','Source A','["Author A"]',2025,'','read','human','cite_lib','2026-11-03','10.1234/a'),
 ('cite_b','Target B','["Author B"]',2024,'','read','human','cite_lib','2026-11-03','10.1234/b'),
 ('cite_other_b','Other library B','[]',2024,'','read','human','cite_other','2026-11-03','10.1234/b');

CREATE OR REPLACE FUNCTION pg_temp.publish_citation(p_id TEXT,provider_name TEXT,ids JSONB,refs JSONB,
                                                   state TEXT DEFAULT 'succeeded') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE j public.paper_citation_jobs;
BEGIN
    UPDATE public.paper_citation_jobs SET status='pending',next_attempt_at=now() WHERE paper_id=p_id AND provider=provider_name;
    SELECT * INTO j FROM public.claim_citation_job((SELECT id FROM public.paper_citation_jobs WHERE paper_id=p_id AND provider=provider_name));
    IF NOT public.finish_citation_job(j.id,j.lease_token,jsonb_build_object(
        'provider',provider_name,'status',state,'resolution','exact','version','test',
        'identities',ids,'references',refs,'candidates','[]'::jsonb)) THEN
        RAISE EXCEPTION 'Expected publication';
    END IF;
END $$;

DO $$
DECLARE result JSONB; j paper_citation_jobs; old_token UUID; old_id UUID; n INTEGER;
BEGIN
    IF (SELECT count(*) FROM paper_citation_jobs WHERE paper_id='cite_a')<>2 THEN
        RAISE EXCEPTION 'Insert trigger must enqueue both providers';
    END IF;
    PERFORM pg_temp.publish_citation('cite_a','openalex','{"doi":"10.1234/a","openalex":"W1"}',
        '[{"key":"W2","identifiers":{"openalex":"W2"},"raw":{"source_work":"W1","target_work":"W2"}},
          {"key":"W1","identifiers":{"openalex":"W1"},"raw":{}},
          {"key":"W999","identifiers":{"openalex":"W999"},"raw":{}}]');
    IF (SELECT count(*) FROM paper_citations WHERE citing_paper_id='cite_a')<>0 THEN
        RAISE EXCEPTION 'Unresolved and self references must not create edges';
    END IF;
    PERFORM pg_temp.publish_citation('cite_other_b','openalex','{"doi":"10.1234/b","openalex":"W2"}','[]');
    IF (get_paper_citations('cite_a')->>'total')::int<>0 THEN RAISE EXCEPTION 'Cross-library leak'; END IF;
    PERFORM pg_temp.publish_citation('cite_b','openalex','{"doi":"10.1234/b","openalex":"W2"}','[]');
    result := get_paper_citations('cite_a');
    IF (result->>'total')::int<>1 OR result#>>'{items,0,id}'<>'cite_b' THEN RAISE EXCEPTION 'Late identity did not reconcile'; END IF;
    IF (get_paper_citations('cite_b','incoming')->>'total')::int<>1
       OR (get_paper_citations('cite_b','outgoing')->>'total')::int<>0 THEN RAISE EXCEPTION 'Incorrect direction'; END IF;
    IF jsonb_array_length(result#>'{items,0,evidence}')<>1 THEN RAISE EXCEPTION 'Missing evidence'; END IF;
    IF (result->>'unresolved_count')::int<>2 THEN RAISE EXCEPTION 'Unresolved count mismatch'; END IF;
    IF jsonb_array_length(get_paper_citations('cite_a','outgoing',1,1)->'items')<>0 THEN RAISE EXCEPTION 'Offset ignored'; END IF;

    -- Failure and partial refresh preserve the old published references.
    PERFORM enqueue_paper_citations('cite_a',true);
    SELECT * INTO j FROM claim_citation_job((SELECT id FROM paper_citation_jobs WHERE paper_id='cite_a' AND provider='openalex'));
    IF NOT fail_citation_job(j.id,j.lease_token,'HTTP 429',true,120) THEN RAISE EXCEPTION 'Failure not recorded'; END IF;
    IF EXISTS(SELECT 1 FROM claim_citation_job(j.id)) THEN RAISE EXCEPTION 'Retry-After ignored'; END IF;
    IF (get_paper_citations('cite_a')->>'total')::int<>1 THEN RAISE EXCEPTION 'Failed refresh destroyed evidence'; END IF;
    PERFORM pg_temp.publish_citation('cite_a','openalex','{"doi":"10.1234/a","openalex":"W1"}','[]','partial');
    IF (get_paper_citations('cite_a')->>'total')::int<>1 THEN RAISE EXCEPTION 'Partial refresh destroyed evidence'; END IF;

    -- Multiple providers support one edge, without double counting.
    PERFORM pg_temp.publish_citation('cite_a','crossref','{"doi":"10.1234/a"}',
        '[{"key":"r1","identifiers":{"doi":"10.1234/b"},"raw":{"DOI":"10.1234/b"}}]');
    result := get_paper_citations('cite_a');
    IF (result->>'total')::int<>1 OR jsonb_array_length(result#>'{items,0,evidence}')<>2 THEN
        RAISE EXCEPTION 'Provider evidence was lost or edge counted twice';
    END IF;
    PERFORM pg_temp.publish_citation('cite_a','openalex','{"doi":"10.1234/a","openalex":"W1"}','[]');
    IF (get_paper_citations('cite_a')->>'total')::int<>1 THEN RAISE EXCEPTION 'Other provider evidence lost'; END IF;
    PERFORM pg_temp.publish_citation('cite_a','crossref','{"doi":"10.1234/a"}','[]');
    IF (get_paper_citations('cite_a')->>'total')::int<>0 THEN RAISE EXCEPTION 'Unsupported edge retained'; END IF;

    -- Expired lease is reclaimed; old worker cannot publish or overwrite new status.
    PERFORM enqueue_paper_citations('cite_a',true);
    SELECT * INTO j FROM claim_citation_job((SELECT id FROM paper_citation_jobs WHERE paper_id='cite_a' AND provider='openalex'));
    old_token:=j.lease_token; old_id:=j.id;
    IF EXISTS(SELECT 1 FROM claim_citation_job(j.id)) THEN RAISE EXCEPTION 'Double claim'; END IF;
    UPDATE paper_citation_jobs SET lease_until=now()-interval '1 second' WHERE id=j.id;
    SELECT * INTO j FROM claim_citation_job(j.id);
    IF j.lease_token=old_token OR j.attempts<>2 THEN RAISE EXCEPTION 'Lease not reclaimed'; END IF;
    IF finish_citation_job(old_id,old_token,'{}') OR fail_citation_job(old_id,old_token,'old error') THEN
        RAISE EXCEPTION 'Old worker was not fenced';
    END IF;
    UPDATE papers SET title='Updated Source A' WHERE id='cite_a';
    IF finish_citation_job(j.id,j.lease_token,'{}') THEN RAISE EXCEPTION 'Changed source accepted stale publication'; END IF;
    IF EXISTS(SELECT 1 FROM paper_external_ids WHERE paper_id='cite_a' AND asserted_by<>'local') THEN RAISE EXCEPTION 'Identity not invalidated'; END IF;

    -- Ambiguous local duplicate does not choose the first copy.
    INSERT INTO papers(id,title,authors,year,venue,status,source,library_id,created_at,doi)
    VALUES ('cite_b_duplicate','Target B copy','[]',2024,'','read','human','cite_lib','2026-11-03','10.1234/b');
    PERFORM pg_temp.publish_citation('cite_a','openalex','{"doi":"10.1234/a","openalex":"W1"}',
        '[{"key":"W2","identifiers":{"openalex":"W2"},"raw":{}}]');
    IF (get_paper_citations('cite_a')->>'total')::int<>0 THEN
        RAISE EXCEPTION 'Unindexed duplicate was ignored by provider-ID matching';
    END IF;
    PERFORM pg_temp.publish_citation('cite_b_duplicate','openalex','{"doi":"10.1234/b","openalex":"W2"}','[]');
    PERFORM pg_temp.publish_citation('cite_a','openalex','{"doi":"10.1234/a","openalex":"W1"}',
        '[{"key":"W2","identifiers":{"openalex":"W2"},"raw":{}}]');
    IF (get_paper_citations('cite_a')->>'total')::int<>0 THEN RAISE EXCEPTION 'Ambiguous duplicate selected'; END IF;
    DELETE FROM papers WHERE id='cite_b_duplicate';
    IF (get_paper_citations('cite_a')->>'total')::int<>1 THEN RAISE EXCEPTION 'Duplicate removal did not reconcile'; END IF;

    -- Reciprocal citations must be independently supported.
    PERFORM pg_temp.publish_citation('cite_b','openalex','{"doi":"10.1234/b","openalex":"W2"}',
        '[{"key":"W1","identifiers":{"openalex":"W1"},"raw":{}}]');
    IF (get_paper_citations('cite_a','incoming')->>'total')::int<>1 THEN RAISE EXCEPTION 'Reciprocal link missing'; END IF;
    DELETE FROM papers WHERE id='cite_b';
    IF EXISTS(SELECT 1 FROM paper_citations WHERE citing_paper_id='cite_b' OR cited_paper_id='cite_b') THEN
        RAISE EXCEPTION 'Paper deletion did not cascade';
    END IF;
    IF get_paper_citations('missing') IS NOT NULL THEN RAISE EXCEPTION 'Missing paper contract'; END IF;
END $$;
ROLLBACK;
