-- Run after 033 and 034 on a disposable database.
BEGIN;
INSERT INTO libraries(id,name,created_at) VALUES ('pdf_lib','PDF citations','2026-11-03');
INSERT INTO papers(id,title,authors,year,venue,status,source,library_id,created_at,pdf_url,doi) VALUES
 ('pdf_source','PDF-only source','[]',2025,'','read','human','pdf_lib','2026-11-03','https://storage.example/p.pdf',NULL),
 ('pdf_target','Target','[]',2024,'','read','human','pdf_lib','2026-11-03',NULL,'10.1234/target');

DO $$
DECLARE j paper_citation_jobs; old_token UUID; result JSONB; revision BIGINT;
BEGIN
    IF EXISTS(SELECT 1 FROM paper_citation_jobs WHERE provider='grobid' AND paper_id='pdf_source') THEN
        RAISE EXCEPTION 'PDF extraction must be opt-in';
    END IF;
    PERFORM enqueue_pdf_citations('pdf_source');
    PERFORM enqueue_pdf_citations('pdf_source');
    IF (SELECT count(*) FROM paper_citation_jobs WHERE paper_id='pdf_source' AND provider='grobid')<>1 THEN
        RAISE EXCEPTION 'Duplicate PDF jobs';
    END IF;
    SELECT * INTO j FROM claim_citation_job((SELECT id FROM paper_citation_jobs WHERE paper_id='pdf_source' AND provider='grobid'));
    result := '{"provider":"grobid","status":"succeeded","resolution":"exact","version":"grobid:test;sha256:original","identities":{},"candidates":[],"references":[{"key":"b0","identifiers":{"doi":"10.1234/target"},"raw":{"unstructured":"Original reference","pdf_sha256":"original"}}]}'::jsonb;
    IF NOT finish_citation_job(j.id,j.lease_token,result) THEN RAISE EXCEPTION 'PDF publication failed'; END IF;
    IF (get_paper_citations('pdf_source')->>'total')::int<>1 THEN RAISE EXCEPTION 'PDF-only source did not match target DOI'; END IF;
    IF get_paper_citations('pdf_source')#>>'{items,0,evidence,0,reference,pdf_sha256}'<>'original' THEN
        RAISE EXCEPTION 'PDF hash was lost';
    END IF;
    PERFORM enqueue_pdf_citations('pdf_source',true);
    SELECT * INTO j FROM claim_citation_job(j.id);
    -- A parser with no structured output must not erase previous evidence.
    IF NOT finish_citation_job(j.id,j.lease_token,jsonb_set(jsonb_set(result,'{status}','"partial"'),'{references}','[]')) THEN
        RAISE EXCEPTION 'Partial run failed';
    END IF;
    IF (get_paper_citations('pdf_source')->>'total')::int<>1 THEN RAISE EXCEPTION 'Partial extraction erased evidence'; END IF;
    PERFORM enqueue_pdf_citations('pdf_source',true);
    SELECT * INTO j FROM claim_citation_job(j.id);
    SELECT pdf_revision INTO revision FROM papers WHERE id='pdf_source';
    UPDATE papers SET pdf_url=pdf_url WHERE id='pdf_source';
    IF (SELECT pdf_revision FROM papers WHERE id='pdf_source')<>revision+1 THEN RAISE EXCEPTION 'Same-URL upload not versioned'; END IF;
    IF finish_citation_job(j.id,j.lease_token,result) THEN RAISE EXCEPTION 'Old PDF worker published after replacement'; END IF;
    IF (get_paper_citations('pdf_source')->>'total')::int<>0 THEN RAISE EXCEPTION 'Old PDF evidence still visible'; END IF;
    IF (SELECT status FROM paper_citation_jobs WHERE id=j.id)<>'pending' THEN RAISE EXCEPTION 'Opted-in PDF job not requeued'; END IF;
    UPDATE papers SET title='Changed target' WHERE id='pdf_target';
    IF EXISTS(SELECT 1 FROM paper_citation_jobs WHERE paper_id='pdf_target' AND provider='grobid') THEN
        RAISE EXCEPTION 'Metadata edit enabled PDF extraction without opt-in';
    END IF;
END $$;
ROLLBACK;
