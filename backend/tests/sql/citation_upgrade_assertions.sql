DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM paper_external_ids WHERE paper_id='upgrade_target'
        AND provider='doi' AND external_id='10.1234/target' AND asserted_by='local') THEN
        RAISE EXCEPTION 'Upgrade did not seed unindexed target identifiers';
    END IF;
    IF (get_paper_citations('upgrade_source')->>'total')::int<>1 THEN
        RAISE EXCEPTION 'Retained references did not reconcile against seeded identities';
    END IF;
    IF EXISTS((SELECT * FROM upgrade_jobs_before EXCEPT SELECT * FROM paper_citation_jobs)
        UNION ALL (SELECT * FROM paper_citation_jobs EXCEPT SELECT * FROM upgrade_jobs_before)) THEN
        RAISE EXCEPTION 'Upgrade changed or queued jobs';
    END IF;
    IF EXISTS((SELECT * FROM upgrade_refs_before EXCEPT SELECT * FROM paper_references)
        UNION ALL (SELECT * FROM paper_references EXCEPT SELECT * FROM upgrade_refs_before)) THEN
        RAISE EXCEPTION 'Upgrade changed raw reference records';
    END IF;
    IF EXISTS((SELECT * FROM upgrade_runs_before EXCEPT SELECT * FROM paper_reference_runs)
        UNION ALL (SELECT * FROM paper_reference_runs EXCEPT SELECT * FROM upgrade_runs_before)) THEN
        RAISE EXCEPTION 'Upgrade changed published runs';
    END IF;
    IF EXISTS(SELECT 1 FROM papers p JOIN upgrade_fingerprints_before old USING(id)
        WHERE citation_fingerprint(p)<>old.fingerprint) THEN
        RAISE EXCEPTION 'Upgrade reverted PDF fingerprint format';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='papers'::regclass
        AND tgname='paper_citations_changed' AND (tgtype::int & 8)=8) THEN
        RAISE EXCEPTION 'Upgrade omitted deletion reconciliation trigger';
    END IF;
END $$;

-- Existing opt-in for both PDF engines must still respond to source replacement.
UPDATE papers SET pdf_url=pdf_url WHERE id='upgrade_source';
DO $$
BEGIN
    IF (SELECT pdf_revision FROM papers WHERE id='upgrade_source')<>8 THEN
        RAISE EXCEPTION 'PDF revision trigger was lost';
    END IF;
    IF (SELECT count(*) FROM paper_citation_jobs WHERE paper_id='upgrade_source'
        AND provider IN ('grobid','pymupdf') AND status='pending')<>2 THEN
        RAISE EXCEPTION 'PDF engine opt-in was lost';
    END IF;
END $$;
DELETE FROM papers WHERE library_id='upgrade_lib';
DELETE FROM libraries WHERE id='upgrade_lib';
