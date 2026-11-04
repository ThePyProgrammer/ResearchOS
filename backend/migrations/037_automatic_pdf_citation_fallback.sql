-- Requires 036. Provider jobs are already queued by the paper insertion trigger.
-- The worker checks storage ownership before calling the atomic enqueue function.
BEGIN;
CREATE OR REPLACE FUNCTION public.citation_needs_pdf_fallback(p public.papers) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path=public AS $$
    SELECT p.pdf_url IS NOT NULL
      AND (SELECT count(*) FROM paper_citation_jobs j WHERE j.paper_id=p.id
           AND j.provider IN ('openalex','crossref')
           AND j.fingerprint=citation_fingerprint(p)
           AND j.status IN ('succeeded','partial','not_found','failed'))=2
      -- Reference availability, not the number of matched local edges, controls fallback.
      -- Partial runs and previously retained evidence also count as retrieved references.
      AND NOT EXISTS (
          SELECT 1 FROM paper_reference_runs run JOIN paper_references r ON r.run_id=run.id
          WHERE run.paper_id=p.id AND run.provider IN ('openalex','crossref')
            AND (run.active OR run.fingerprint=citation_fingerprint(p))
      )
      -- An unchanged source is attempted once; retries belong to its existing job.
      AND NOT EXISTS (
          SELECT 1 FROM paper_citation_jobs j WHERE j.paper_id=p.id AND j.provider='pymupdf'
            AND j.fingerprint=citation_fingerprint(p)
      );
$$;

CREATE OR REPLACE FUNCTION public.get_pdf_citation_fallback_candidates(
    p_paper_ids TEXT[] DEFAULT NULL, p_after_id TEXT DEFAULT '', p_limit INTEGER DEFAULT 100)
RETURNS TABLE(paper_id TEXT,pdf_url TEXT,fingerprint TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
    SELECT p.id,p.pdf_url,citation_fingerprint(p) FROM papers p
    WHERE p.id>p_after_id AND (p_paper_ids IS NULL OR p.id=ANY(p_paper_ids))
      AND citation_needs_pdf_fallback(p)
    ORDER BY p.id LIMIT greatest(1,least(p_limit,500));
$$;

CREATE OR REPLACE FUNCTION public.enqueue_pdf_citation_fallback(p_paper_id TEXT,p_fingerprint TEXT)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p papers;
BEGIN
    SELECT * INTO p FROM papers WHERE id=p_paper_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    -- Recheck under the same paper lock used by provider publication and source edits.
    IF citation_fingerprint(p)<>p_fingerprint OR NOT citation_needs_pdf_fallback(p) THEN RETURN; END IF;
    RETURN QUERY SELECT * FROM enqueue_local_pdf_citations(p.id);
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
