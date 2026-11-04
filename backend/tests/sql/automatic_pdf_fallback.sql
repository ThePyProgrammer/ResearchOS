BEGIN;
INSERT INTO libraries(id,name,created_at) VALUES ('fallback_lib','Fallback tests','2026-11-04');
INSERT INTO papers(id,title,authors,year,venue,status,source,library_id,created_at,pdf_url)
SELECT 'fallback_'||name,name,'[]',2026,'','read','human','fallback_lib','2026-11-04',
       CASE WHEN name='no_pdf' THEN NULL ELSE 'https://storage.example/'||name||'.pdf' END
FROM unnest(ARRAY['empty','pending','failed','refs','partial_refs','no_pdf','late_pdf']) name;

DO $$
BEGIN
    -- All import insertion paths share this trigger, regardless of automatic notes.
    IF (SELECT count(*) FROM paper_citation_jobs WHERE paper_id LIKE 'fallback_%')<>14 THEN
        RAISE EXCEPTION 'Imports did not automatically queue both providers';
    END IF;
    IF EXISTS(SELECT 1 FROM get_pdf_citation_fallback_candidates()) THEN
        RAISE EXCEPTION 'PDF fallback must wait for provider attempts';
    END IF;
END $$;
UPDATE paper_citation_jobs SET status='succeeded' WHERE paper_id LIKE 'fallback_%' AND paper_id<>'fallback_pending';
UPDATE paper_citation_jobs SET status='failed' WHERE paper_id='fallback_failed';
INSERT INTO paper_reference_runs(paper_id,provider,status,resolution,fingerprint,active,version)
SELECT id,'openalex',CASE WHEN id='fallback_partial_refs' THEN 'partial' ELSE 'succeeded' END,
       'exact',citation_fingerprint(p),id='fallback_refs','test'
FROM papers p WHERE id IN ('fallback_refs','fallback_partial_refs');
INSERT INTO paper_references(run_id,reference_key,identifiers,raw)
SELECT id,'unmatched','{"openalex":"W99999"}','{}' FROM paper_reference_runs
WHERE paper_id IN ('fallback_refs','fallback_partial_refs');

DO $$
DECLARE f TEXT; j paper_citation_jobs;
BEGIN
    IF EXISTS(SELECT 1 FROM get_pdf_citation_fallback_candidates() WHERE paper_id IN
        ('fallback_refs','fallback_partial_refs','fallback_no_pdf','fallback_pending')) THEN
        RAISE EXCEPTION 'Fallback ignored retrieved references, missing PDF, or pending provider';
    END IF;
    IF (SELECT count(*) FROM get_pdf_citation_fallback_candidates(ARRAY['fallback_failed']))<>1 THEN
        RAISE EXCEPTION 'Exhausted provider failure should allow fallback';
    END IF;
    IF EXISTS(SELECT 1 FROM get_pdf_citation_fallback_candidates(ARRAY[]::TEXT[])) THEN
        RAISE EXCEPTION 'Empty batch leaked into other papers';
    END IF;
    SELECT citation_fingerprint(p) INTO f FROM papers p WHERE id='fallback_empty';
    SELECT * INTO j FROM enqueue_pdf_citation_fallback('fallback_empty',f);
    IF j.provider IS DISTINCT FROM 'pymupdf' THEN RAISE EXCEPTION 'Fallback did not use local engine'; END IF;
    IF EXISTS(SELECT 1 FROM enqueue_pdf_citation_fallback('fallback_empty',f)) THEN
        RAISE EXCEPTION 'Repeated sweep duplicated fallback';
    END IF;
    UPDATE paper_citation_jobs SET status='partial' WHERE id=j.id;
    IF EXISTS(SELECT 1 FROM enqueue_pdf_citation_fallback('fallback_empty',f)) THEN
        RAISE EXCEPTION 'Partial PDF extraction was repeatedly requeued';
    END IF;
    -- A provider refresh must not repeat an unchanged PDF attempt.
    PERFORM enqueue_paper_citations('fallback_empty',true);
    UPDATE paper_citation_jobs SET status='succeeded' WHERE paper_id='fallback_empty' AND provider IN ('openalex','crossref');
    IF EXISTS(SELECT 1 FROM enqueue_pdf_citation_fallback('fallback_empty',f)) THEN
        RAISE EXCEPTION 'Provider refresh reran cached PDF extraction';
    END IF;
    SELECT citation_fingerprint(p) INTO f FROM papers p WHERE id='fallback_failed';
    UPDATE papers SET title='Changed during storage ownership check' WHERE id='fallback_failed';
    IF EXISTS(SELECT 1 FROM enqueue_pdf_citation_fallback('fallback_failed',f)) THEN
        RAISE EXCEPTION 'Stale candidate queued after a source edit';
    END IF;
    -- A reference arriving after candidate discovery prevents fallback under lock.
    SELECT citation_fingerprint(p) INTO f FROM papers p WHERE id='fallback_late_pdf';
    INSERT INTO paper_reference_runs(paper_id,provider,status,resolution,fingerprint,active,version)
    VALUES('fallback_late_pdf','crossref','succeeded','exact',f,true,'test');
    INSERT INTO paper_references(run_id,reference_key,identifiers,raw)
    SELECT id,'late','{}','{}' FROM paper_reference_runs WHERE paper_id='fallback_late_pdf';
    IF EXISTS(SELECT 1 FROM enqueue_pdf_citation_fallback('fallback_late_pdf',f)) THEN
        RAISE EXCEPTION 'Late provider reference was ignored';
    END IF;
END $$;

-- Import initially has no stored PDF. Download completion requeues providers;
-- fallback becomes eligible only after those current-source attempts finish.
UPDATE papers SET pdf_url='https://storage.example/downloaded.pdf' WHERE id='fallback_no_pdf';
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM get_pdf_citation_fallback_candidates(ARRAY['fallback_no_pdf'])) THEN
        RAISE EXCEPTION 'Late PDF download bypassed provider jobs';
    END IF;
END $$;
UPDATE paper_citation_jobs SET status='not_found' WHERE paper_id='fallback_no_pdf';
DO $$
BEGIN
    IF (SELECT count(*) FROM get_pdf_citation_fallback_candidates(ARRAY['fallback_no_pdf']))<>1 THEN
        RAISE EXCEPTION 'Imported PDF never became eligible after download';
    END IF;
END $$;
ROLLBACK;
