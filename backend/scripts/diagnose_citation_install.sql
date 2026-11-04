-- Read-only: run in the same Supabase project's SQL editor as migrations 033-035.
-- Returns one JSON result. Contains schema definitions/counts, not paper contents or credentials.
SELECT jsonb_build_object(
    'paper_count', (SELECT count(*) FROM public.papers),
    'papers_with_identifiers', (
        SELECT count(*) FROM public.papers
        WHERE nullif(btrim(doi),'') IS NOT NULL OR nullif(btrim(arxiv_id),'') IS NOT NULL
    ),
    'identity_counts', (
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
            SELECT provider, asserted_by, count(*) AS records
            FROM public.paper_external_ids GROUP BY provider, asserted_by
            ORDER BY provider, asserted_by
        ) t
    ),
    'functions', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'name', p.proname,
            'arguments', pg_get_function_identity_arguments(p.oid),
            'definition', pg_get_functiondef(p.oid)
        ) ORDER BY p.proname), '[]'::jsonb)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN (
            'citation_local_ids', 'enqueue_paper_citations', 'citation_fingerprint'
        )
    ),
    'paper_triggers', (
        SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname), '[]'::jsonb)
        FROM pg_trigger t
        WHERE t.tgrelid='public.papers'::regclass AND NOT t.tgisinternal
          AND t.tgname LIKE '%citation%'
    )
) AS citation_installation;
