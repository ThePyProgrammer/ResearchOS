-- Run after 028_pi_membership.sql. Safe to rerun; no stored data changes.
BEGIN;

-- Separate directory projection keeps detail reads and mutations lightweight.
-- The (lab_id, paper_id) primary key supports each count without paper joins
-- or duplicate authorship counts. PostgREST applies pagination to lab rows.
CREATE OR REPLACE VIEW public.lab_directory WITH (security_invoker = true) AS
SELECT d.*,
    (SELECT count(*) FROM public.lab_paper_links lp WHERE lp.lab_id = d.id) AS paper_count
FROM public.lab_details d;

NOTIFY pgrst, 'reload schema';
COMMIT;
