-- Optional PDF bibliography indexing. Requires migration 033.
BEGIN;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS pdf_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.paper_reference_runs DROP CONSTRAINT IF EXISTS paper_reference_runs_provider_check;
ALTER TABLE public.paper_reference_runs ADD CONSTRAINT paper_reference_runs_provider_check
    CHECK (provider IN ('openalex','crossref','grobid'));
ALTER TABLE public.paper_citation_jobs DROP CONSTRAINT IF EXISTS paper_citation_jobs_provider_check;
ALTER TABLE public.paper_citation_jobs ADD CONSTRAINT paper_citation_jobs_provider_check
    CHECK (provider IN ('openalex','crossref','grobid'));

CREATE OR REPLACE FUNCTION public.citation_fingerprint(p public.papers) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT md5(jsonb_build_array(p.doi,p.arxiv_id,p.title,p.authors,p.year,p.library_id,p.pdf_url,p.pdf_revision)::text);
$$;

CREATE OR REPLACE FUNCTION public.bump_citation_pdf_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- The upload route writes pdf_url even when replacing the same storage key.
    NEW.pdf_revision := OLD.pdf_revision + 1;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS citation_pdf_revision ON public.papers;
CREATE TRIGGER citation_pdf_revision BEFORE UPDATE OF pdf_url ON public.papers
FOR EACH ROW EXECUTE FUNCTION public.bump_citation_pdf_revision();

CREATE OR REPLACE FUNCTION public.enqueue_pdf_citations(p_paper_id TEXT,p_force BOOLEAN DEFAULT false)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p papers;
BEGIN
    SELECT * INTO p FROM papers WHERE id=p_paper_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO paper_citation_jobs(paper_id,provider,fingerprint)
    VALUES (p.id,'grobid',citation_fingerprint(p))
    ON CONFLICT (paper_id,provider) DO UPDATE SET
        fingerprint=EXCLUDED.fingerprint,status='pending',attempts=0,error=NULL,
        lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now()
    WHERE paper_citation_jobs.fingerprint<>EXCLUDED.fingerprint
       OR (p_force AND paper_citation_jobs.status NOT IN ('pending','running'));
    RETURN QUERY SELECT * FROM paper_citation_jobs WHERE paper_id=p.id AND provider='grobid';
END $$;

CREATE OR REPLACE FUNCTION public.refresh_opted_in_pdf_citations() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
    IF citation_fingerprint(OLD)<>citation_fingerprint(NEW)
       AND EXISTS(SELECT 1 FROM paper_citation_jobs WHERE paper_id=NEW.id AND provider='grobid') THEN
        PERFORM enqueue_pdf_citations(NEW.id);
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS paper_pdf_citations_changed ON public.papers;
CREATE TRIGGER paper_pdf_citations_changed AFTER UPDATE ON public.papers
FOR EACH ROW EXECUTE FUNCTION public.refresh_opted_in_pdf_citations();

-- Rebase existing queued fingerprints without disturbing published provider evidence.
UPDATE paper_citation_jobs j SET fingerprint=citation_fingerprint(p),status='pending',attempts=0,
    lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now()
FROM papers p WHERE p.id=j.paper_id AND j.fingerprint<>citation_fingerprint(p);
COMMIT;
