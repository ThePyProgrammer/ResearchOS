-- Run after 030_author_social_profiles.sql. Safe to rerun; no stored data changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.search_author_profiles(
    p_search text, p_normalized text, p_limit integer DEFAULT 50
)
RETURNS SETOF public.authors
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    SELECT a.*
    FROM public.authors a
    WHERE btrim(p_search) = ''
       OR strpos(lower(a.name), lower(btrim(p_search))) > 0
       OR (p_normalized <> '' AND strpos(a.name_normalized, p_normalized) > 0)
       OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(a.affiliations) affiliation
           WHERE strpos(lower(affiliation->>'institution'), lower(btrim(p_search))) > 0
       )
       OR EXISTS (
           SELECT 1 FROM public.lab_members membership
           JOIN public.labs lab ON lab.id = membership.lab_id
           WHERE membership.author_id = a.id
             AND strpos(lower(lab.name), lower(btrim(p_search))) > 0
       )
       OR EXISTS (
           SELECT 1 FROM public.lab_principal_investigators pi
           JOIN public.labs lab ON lab.id = pi.lab_id
           WHERE pi.author_id = a.id
             AND strpos(lower(lab.name), lower(btrim(p_search))) > 0
       )
    ORDER BY a.name, a.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
