-- Local PDF extraction, opt-in independently of GROBID. Requires 033 and 034.
BEGIN;
ALTER TABLE public.paper_reference_runs DROP CONSTRAINT IF EXISTS paper_reference_runs_provider_check;
ALTER TABLE public.paper_reference_runs ADD CONSTRAINT paper_reference_runs_provider_check CHECK (provider IN ('openalex','crossref','grobid','pymupdf'));
ALTER TABLE public.paper_citation_jobs DROP CONSTRAINT IF EXISTS paper_citation_jobs_provider_check;
ALTER TABLE public.paper_citation_jobs ADD CONSTRAINT paper_citation_jobs_provider_check CHECK (provider IN ('openalex','crossref','grobid','pymupdf'));
CREATE OR REPLACE FUNCTION public.enqueue_local_pdf_citations(p_paper_id TEXT,p_force BOOLEAN DEFAULT false)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p papers;
BEGIN
    SELECT * INTO p FROM papers WHERE id=p_paper_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO paper_citation_jobs(paper_id,provider,fingerprint)
    VALUES (p.id,'pymupdf',citation_fingerprint(p))
    ON CONFLICT (paper_id,provider) DO UPDATE SET
        fingerprint=EXCLUDED.fingerprint,status='pending',attempts=0,error=NULL,
        lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now()
    WHERE paper_citation_jobs.fingerprint<>EXCLUDED.fingerprint
       OR (p_force AND paper_citation_jobs.status NOT IN ('pending','running'));
    RETURN QUERY SELECT * FROM paper_citation_jobs WHERE paper_id=p.id AND provider='pymupdf';
END $$;

CREATE OR REPLACE FUNCTION public.refresh_opted_in_pdf_citations() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
    IF citation_fingerprint(OLD)<>citation_fingerprint(NEW) THEN
        IF EXISTS(SELECT 1 FROM paper_citation_jobs WHERE paper_id=NEW.id AND provider='grobid') THEN
            PERFORM enqueue_pdf_citations(NEW.id);
        END IF;
        IF EXISTS(SELECT 1 FROM paper_citation_jobs WHERE paper_id=NEW.id AND provider='pymupdf') THEN
            PERFORM enqueue_local_pdf_citations(NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END $$;
COMMIT;
