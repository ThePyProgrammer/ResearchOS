-- Upgrade installations that applied an earlier revision of migration 033.
-- Requires 033-035. Preserves PDF fingerprints, provider constraints, jobs and raw references.
-- Stop citation workers while applying. This does not queue a historical backfill.
BEGIN;
LOCK TABLE public.papers IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_advisory_xact_lock(hashtext('researchos-citations'));

CREATE OR REPLACE FUNCTION public.citation_local_ids(p public.papers) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE doi_id TEXT; arxiv TEXT; ids JSONB := '{}';
BEGIN
    doi_id := lower(regexp_replace(btrim(coalesce(p.doi,'')), '^(https?://(dx\.)?doi\.org/|doi:\s*)', '', 'i'));
    IF doi_id ~ '^10\.\d{4,9}/\S+$' THEN ids := ids || jsonb_build_object('doi',doi_id); END IF;
    arxiv := lower(regexp_replace(btrim(coalesce(p.arxiv_id,'')), '^(https?://(www\.|export\.)?arxiv\.org/(abs|pdf)/|arxiv:\s*)', '', 'i'));
    arxiv := regexp_replace(regexp_replace(arxiv,'\.pdf$',''),'v\d+$','');
    IF arxiv ~ '^(\d{4}\.\d{4,5}|[a-z][a-z.\-]+/\d{7})$' THEN ids := ids || jsonb_build_object('arxiv',arxiv); END IF;
    RETURN ids;
END $$;

-- Local identifiers are available before a provider succeeds, including unindexed copies.
INSERT INTO paper_external_ids(paper_id,provider,external_id,asserted_by)
SELECT p.id,ident.key,ident.value,'local' FROM papers p
CROSS JOIN LATERAL jsonb_each_text(citation_local_ids(p)) ident ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.enqueue_paper_citations(p_paper_id TEXT, p_force BOOLEAN DEFAULT false)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE p public.papers; provider_name TEXT;
BEGIN
    SELECT * INTO p FROM papers WHERE id = p_paper_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO paper_external_ids(paper_id,provider,external_id,asserted_by)
    SELECT p.id,key,value,'local' FROM jsonb_each_text(citation_local_ids(p)) ON CONFLICT DO NOTHING;
    FOREACH provider_name IN ARRAY ARRAY['openalex','crossref'] LOOP
        INSERT INTO paper_citation_jobs(paper_id,provider,fingerprint)
        VALUES (p.id,provider_name,citation_fingerprint(p))
        ON CONFLICT (paper_id,provider) DO UPDATE SET
            fingerprint=EXCLUDED.fingerprint, status='pending', attempts=0,
            lease_token=NULL, lease_until=NULL, next_attempt_at=now(), error=NULL,
            captured_record=NULL, updated_at=now()
        WHERE paper_citation_jobs.fingerprint <> EXCLUDED.fingerprint
           OR (p_force AND paper_citation_jobs.status NOT IN ('pending','running'));
    END LOOP;
    RETURN QUERY SELECT * FROM paper_citation_jobs WHERE paper_id=p.id ORDER BY provider;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_paper_citations(p_library_id TEXT) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    -- Serialize short publication/reconciliation transactions, not provider requests.
    PERFORM pg_advisory_xact_lock(hashtext('researchos-citations'));
    DELETE FROM paper_citations c USING papers p
    WHERE c.citing_paper_id=p.id AND p.library_id IS NOT DISTINCT FROM p_library_id;

    WITH matches AS (
        SELECT r.id AS ref, run.paper_id AS source, min(e.paper_id) AS target
        FROM paper_references r
        JOIN paper_reference_runs run ON run.id=r.run_id AND run.active
        JOIN papers src ON src.id=run.paper_id
        CROSS JOIN LATERAL jsonb_each_text(r.identifiers) ident
        JOIN paper_external_ids e ON e.provider=ident.key AND e.external_id=ident.value
        JOIN papers dst ON dst.id=e.paper_id AND dst.library_id IS NOT DISTINCT FROM src.library_id
        WHERE src.library_id IS NOT DISTINCT FROM p_library_id
        GROUP BY r.id, run.paper_id HAVING count(DISTINCT e.paper_id)=1
    )
    INSERT INTO paper_citations
    SELECT DISTINCT source,target FROM matches m
    WHERE source <> target AND NOT EXISTS (
        SELECT 1 FROM paper_external_ids a JOIN paper_external_ids b
        ON a.provider=b.provider AND a.external_id=b.external_id
        WHERE a.paper_id=m.source AND b.paper_id=m.target
    ) AND NOT EXISTS (
        -- A duplicate can be known by DOI before its OpenAlex identity is resolved.
        SELECT 1 FROM paper_external_ids target_id JOIN paper_external_ids duplicate
        ON duplicate.provider=target_id.provider AND duplicate.external_id=target_id.external_id
        JOIN papers copy ON copy.id=duplicate.paper_id
        WHERE target_id.paper_id=m.target AND copy.id<>m.target
          AND copy.library_id IS NOT DISTINCT FROM p_library_id
    ) ON CONFLICT DO NOTHING;

    INSERT INTO paper_citation_evidence(citing_paper_id,cited_paper_id,reference_id)
    SELECT c.citing_paper_id,c.cited_paper_id,r.id
    FROM paper_citations c JOIN papers p ON p.id=c.citing_paper_id
    JOIN paper_reference_runs run ON run.paper_id=c.citing_paper_id AND run.active
    JOIN paper_references r ON r.run_id=run.id
    WHERE p.library_id IS NOT DISTINCT FROM p_library_id
      AND (SELECT count(DISTINCT ids.paper_id)
           FROM jsonb_each_text(r.identifiers) ident
           JOIN paper_external_ids ids ON ids.provider=ident.key AND ids.external_id=ident.value
           JOIN papers target ON target.id=ids.paper_id
           WHERE target.library_id IS NOT DISTINCT FROM p.library_id)=1
      AND EXISTS (SELECT 1 FROM jsonb_each_text(r.identifiers) ident
                  JOIN paper_external_ids ids ON ids.provider=ident.key AND ids.external_id=ident.value
                  WHERE ids.paper_id=c.cited_paper_id)
    ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.queue_citations_on_paper_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE captured JSONB;
BEGIN
    IF TG_OP='DELETE' THEN
        PERFORM reconcile_paper_citations(OLD.library_id);
        RETURN OLD;
    ELSIF TG_OP='INSERT' THEN
        PERFORM enqueue_paper_citations(NEW.id);
        PERFORM reconcile_paper_citations(NEW.library_id);
    ELSIF citation_fingerprint(OLD) <> citation_fingerprint(NEW) THEN
        PERFORM pg_advisory_xact_lock(hashtext('researchos-citations'));
        SELECT captured_record INTO captured FROM paper_citation_jobs WHERE paper_id=NEW.id AND provider='crossref';
        DELETE FROM paper_external_ids WHERE paper_id=NEW.id;
        UPDATE paper_reference_runs SET active=false WHERE paper_id=NEW.id;
        DELETE FROM paper_citations WHERE citing_paper_id=NEW.id OR cited_paper_id=NEW.id;
        PERFORM enqueue_paper_citations(NEW.id);
        IF OLD.doi IS NOT DISTINCT FROM NEW.doi AND captured IS NOT NULL THEN
            UPDATE paper_citation_jobs SET captured_record=captured WHERE paper_id=NEW.id AND provider='crossref';
        END IF;
        PERFORM reconcile_paper_citations(OLD.library_id);
        IF OLD.library_id IS DISTINCT FROM NEW.library_id THEN
            PERFORM reconcile_paper_citations(NEW.library_id);
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS paper_citations_changed ON public.papers;
CREATE TRIGGER paper_citations_changed AFTER INSERT OR UPDATE OR DELETE ON public.papers
FOR EACH ROW EXECUTE FUNCTION public.queue_citations_on_paper_change();

CREATE OR REPLACE FUNCTION public.claim_citation_job(p_job_id UUID DEFAULT NULL)
RETURNS SETOF public.paper_citation_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE job_id UUID;
BEGIN
    UPDATE paper_citation_jobs SET status='failed',error='Worker lease expired repeatedly',
        lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE (p_job_id IS NULL OR id=p_job_id) AND status='running' AND lease_until<now() AND attempts>=5;
    SELECT id INTO job_id FROM paper_citation_jobs
    WHERE (p_job_id IS NULL OR id=p_job_id)
      AND ((status='pending' AND next_attempt_at <= now()) OR (status='running' AND lease_until < now()))
    ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF job_id IS NULL THEN RETURN; END IF;
    RETURN QUERY UPDATE paper_citation_jobs SET status='running',attempts=attempts+1,
        lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
        WHERE id=job_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.finish_citation_job(p_job_id UUID,p_lease_token UUID,p_result JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE j paper_citation_jobs; p papers; run_id UUID; ref JSONB;
BEGIN
    -- Lock in the same order as paper-change triggers: paper, publication lock, job.
    SELECT * INTO p FROM papers WHERE id=(SELECT paper_id FROM paper_citation_jobs WHERE id=p_job_id) FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('researchos-citations'));
    SELECT * INTO j FROM paper_citation_jobs WHERE id=p_job_id FOR UPDATE;
    IF j.status <> 'running' OR j.lease_token IS DISTINCT FROM p_lease_token
       OR j.lease_until < now() OR j.fingerprint <> citation_fingerprint(p) THEN RETURN false; END IF;
    IF j.provider <> p_result->>'provider' THEN RAISE EXCEPTION 'Provider mismatch'; END IF;
    IF p_result->>'status'='succeeded' THEN
        UPDATE paper_reference_runs SET active=false WHERE paper_id=p.id AND provider=j.provider AND active;
        DELETE FROM paper_external_ids WHERE paper_id=p.id AND asserted_by=j.provider;
    END IF;
    INSERT INTO paper_reference_runs(paper_id,provider,fingerprint,status,resolution,active,version,candidates,message)
    VALUES (p.id,j.provider,j.fingerprint,p_result->>'status',p_result->>'resolution',
            p_result->>'status'='succeeded',p_result->>'version',coalesce(p_result->'candidates','[]'),p_result->>'message')
    RETURNING id INTO run_id;
    INSERT INTO paper_external_ids(paper_id,provider,external_id,asserted_by)
    SELECT p.id,key,value,j.provider FROM jsonb_each_text(p_result->'identities')
    ON CONFLICT (paper_id,provider,external_id,asserted_by) DO UPDATE SET resolved_at=now();
    FOR ref IN SELECT * FROM jsonb_array_elements(p_result->'references') LOOP
        INSERT INTO paper_references(run_id,reference_key,identifiers,raw)
        VALUES (run_id,ref->>'key',ref->'identifiers',ref->'raw') ON CONFLICT DO NOTHING;
    END LOOP;
    UPDATE paper_citation_jobs SET status=p_result->>'status',error=p_result->>'message',
        captured_record=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    PERFORM reconcile_paper_citations(p.library_id);
    RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fail_citation_job(p_job_id UUID,p_lease_token UUID,p_error TEXT,
                                                   p_retry BOOLEAN DEFAULT false,p_retry_seconds INTEGER DEFAULT 60)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    UPDATE paper_citation_jobs SET status=CASE WHEN p_retry AND attempts<5 THEN 'pending' ELSE 'failed' END,
        error=left(p_error,300),lease_token=NULL,lease_until=NULL,updated_at=now(),
        next_attempt_at=now()+make_interval(secs=>greatest(1,p_retry_seconds))
    WHERE id=p_job_id AND status='running' AND lease_token=p_lease_token AND lease_until >= now();
    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.capture_crossref_references(p_paper_id TEXT,p_record JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    -- Only attach to a queued job. A racing worker can safely fetch its own copy.
    UPDATE paper_citation_jobs SET captured_record=p_record,updated_at=now()
    WHERE paper_id=p_paper_id AND provider='crossref' AND status='pending';
    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.get_paper_citations(p_paper_id TEXT,p_direction TEXT DEFAULT 'outgoing',
                                                     p_limit INTEGER DEFAULT 20,p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE lib TEXT; result JSONB;
BEGIN
    SELECT library_id INTO lib FROM papers WHERE id=p_paper_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_direction NOT IN ('incoming','outgoing') THEN RAISE EXCEPTION 'Invalid citation direction'; END IF;
    WITH edges AS (
        SELECT c.*,CASE WHEN p_direction='outgoing' THEN c.cited_paper_id ELSE c.citing_paper_id END AS target
        FROM paper_citations c
        JOIN papers a ON a.id=c.citing_paper_id JOIN papers b ON b.id=c.cited_paper_id
        WHERE a.library_id IS NOT DISTINCT FROM lib AND b.library_id IS NOT DISTINCT FROM lib
          AND CASE WHEN p_direction='outgoing' THEN c.citing_paper_id ELSE c.cited_paper_id END=p_paper_id
    ), page AS (
        SELECT e.*,p.title,p.authors,p.year FROM edges e JOIN papers p ON p.id=e.target
        ORDER BY p.year DESC,p.title,p.id LIMIT greatest(1,least(p_limit,100)) OFFSET greatest(p_offset,0)
    )
    SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',pg.target,'title',pg.title,'authors',pg.authors,'year',pg.year,'evidence',(
            SELECT jsonb_agg(jsonb_build_object('provider',run.provider,'method',ev.method,
                'indexed_at',run.created_at,'reference',r.raw) ORDER BY run.provider,r.id)
            FROM paper_citation_evidence ev JOIN paper_references r ON r.id=ev.reference_id
            JOIN paper_reference_runs run ON run.id=r.run_id
            WHERE ev.citing_paper_id=pg.citing_paper_id AND ev.cited_paper_id=pg.cited_paper_id
        )) ORDER BY pg.year DESC,pg.title,pg.target) FROM page pg),'[]'),
        'total',(SELECT count(*) FROM edges),'limit',greatest(1,least(p_limit,100)),
        'offset',greatest(p_offset,0),'direction',p_direction,
        'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'paper_id',paper_id,'provider',provider,
            'status',status,'attempts',attempts,'updated_at',updated_at,'error',error) ORDER BY provider)
            FROM paper_citation_jobs WHERE paper_id=p_paper_id),'[]'),
        'runs',coalesce((SELECT jsonb_agg(jsonb_build_object('provider',provider,'status',status,
            'resolution',resolution,'active',active,'indexedAt',created_at,'message',message,
            'candidates',candidates) ORDER BY provider,created_at DESC) FROM (
              SELECT DISTINCT ON (provider,active) * FROM paper_reference_runs
              WHERE paper_id=p_paper_id ORDER BY provider,active,created_at DESC,id DESC
            ) recent),'[]'),
        'unresolved_count',(SELECT count(*) FROM paper_references r JOIN paper_reference_runs run ON run.id=r.run_id
            WHERE run.paper_id=p_paper_id AND run.active AND NOT EXISTS
            (SELECT 1 FROM paper_citation_evidence ev WHERE ev.reference_id=r.id)),
        'indexed_papers',(SELECT count(DISTINCT run.paper_id) FROM paper_reference_runs run
            JOIN papers p ON p.id=run.paper_id WHERE run.active AND p.library_id IS NOT DISTINCT FROM lib),
        'pending_jobs',(SELECT count(*) FROM paper_citation_jobs j JOIN papers p ON p.id=j.paper_id
            WHERE j.status IN ('pending','running') AND p.library_id IS NOT DISTINCT FROM lib),
        'library_papers',(SELECT count(*) FROM papers WHERE library_id IS NOT DISTINCT FROM lib)) INTO result;
    RETURN result;
END $$;

-- Rebuild derived edges against seeded identifiers without fetching provider data.
DO $$
DECLARE lib TEXT;
BEGIN
    FOR lib IN SELECT DISTINCT library_id FROM public.papers LOOP
        PERFORM public.reconcile_paper_citations(lib);
    END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
