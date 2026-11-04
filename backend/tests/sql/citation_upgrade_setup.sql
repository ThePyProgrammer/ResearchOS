-- Simulate the older deployed 033: no local IDs, no helper, INSERT/UPDATE trigger only.
INSERT INTO libraries(id,name,created_at) VALUES ('upgrade_lib','Upgrade fixture','2026-11-04');
INSERT INTO papers(id,title,authors,year,venue,status,source,library_id,created_at,doi,pdf_revision) VALUES
 ('upgrade_source','Source','[]',2025,'','read','human','upgrade_lib','2026-11-04','10.1234/source',7),
 ('upgrade_target','Target','[]',2024,'','read','human','upgrade_lib','2026-11-04','10.1234/target',0);
SELECT enqueue_pdf_citations('upgrade_source');
SELECT enqueue_local_pdf_citations('upgrade_source');
UPDATE paper_citation_jobs SET status='succeeded' WHERE paper_id='upgrade_source';
INSERT INTO paper_reference_runs(paper_id,provider,status,resolution,fingerprint,active,version)
SELECT id,'crossref','succeeded','exact',citation_fingerprint(papers),true,'retained-version'
FROM papers WHERE id='upgrade_source';
INSERT INTO paper_references(run_id,reference_key,identifiers,raw)
SELECT id,'retained-reference','{"doi":"10.1234/target"}', '{"unstructured":"Retained original reference"}'
FROM paper_reference_runs WHERE paper_id='upgrade_source';
DELETE FROM paper_external_ids WHERE asserted_by='local';

CREATE OR REPLACE FUNCTION public.enqueue_paper_citations(p_paper_id TEXT,p_force BOOLEAN DEFAULT false)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p public.papers; provider_name TEXT;
BEGIN
    SELECT * INTO p FROM papers WHERE id=p_paper_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    FOREACH provider_name IN ARRAY ARRAY['openalex','crossref'] LOOP
        INSERT INTO paper_citation_jobs(paper_id,provider,fingerprint)
        VALUES(p.id,provider_name,citation_fingerprint(p))
        ON CONFLICT(paper_id,provider) DO NOTHING;
    END LOOP;
    RETURN QUERY SELECT * FROM paper_citation_jobs WHERE paper_id=p.id ORDER BY provider;
END $$;
DROP FUNCTION public.citation_local_ids(public.papers);
DROP TRIGGER paper_citations_changed ON papers;
CREATE TRIGGER paper_citations_changed AFTER INSERT OR UPDATE ON papers
FOR EACH ROW EXECUTE FUNCTION queue_citations_on_paper_change();

CREATE TEMP TABLE upgrade_jobs_before AS SELECT * FROM paper_citation_jobs;
CREATE TEMP TABLE upgrade_refs_before AS SELECT * FROM paper_references;
CREATE TEMP TABLE upgrade_runs_before AS SELECT * FROM paper_reference_runs;
CREATE TEMP TABLE upgrade_fingerprints_before AS SELECT id,citation_fingerprint(papers) AS fingerprint FROM papers;
