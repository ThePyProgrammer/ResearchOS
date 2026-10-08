-- Run after 026_explicit_lab_papers.sql. Safe to rerun; preserves existing data.
BEGIN;

ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS websites TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(websites) <= 20 AND array_position(websites, NULL) IS NULL);

CREATE TABLE IF NOT EXISTS public.lab_principal_investigators (
    lab_id TEXT NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
    PRIMARY KEY (lab_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_lab_pis_author ON public.lab_principal_investigators (author_id);
-- Same shared-workspace access model as labs and lab_members.
ALTER TABLE public.lab_principal_investigators DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.lab_details WITH (security_invoker = true) AS
SELECT l.id, l.name, l.description, l.created_at, l.websites,
    coalesce((
        SELECT jsonb_agg(jsonb_build_object('author_id', a.id, 'name', a.name, 'orcid', a.orcid)
                         ORDER BY a.name, a.id)
        FROM public.lab_principal_investigators pi JOIN public.authors a ON a.id = pi.author_id
        WHERE pi.lab_id = l.id
    ), '[]'::jsonb) AS principal_investigators
FROM public.labs l;

-- A single atomic write returns the complete detail. Omitted fields are kept;
-- empty arrays explicitly clear links. No membership or paper writes occur.
CREATE OR REPLACE FUNCTION public.save_lab_details(
    p_lab_id TEXT, p_data JSONB, p_created_at TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_pi_ids TEXT[];
    v_websites TEXT[];
    v_result JSONB;
BEGIN
    IF p_created_at IS NOT NULL THEN
        INSERT INTO public.labs (id, name, description, created_at)
        VALUES (p_lab_id, p_data->>'name', p_data->>'description', p_created_at);
    ELSE
        -- Serialize saves to a lab, including the replacement of its PI set.
        PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR UPDATE;
        IF NOT FOUND THEN RETURN NULL; END IF;
    END IF;

    IF p_data ? 'pi_author_ids' THEN
        IF jsonb_typeof(p_data->'pi_author_ids') IS DISTINCT FROM 'array'
           OR jsonb_array_length(p_data->'pi_author_ids') > 50 THEN
            RAISE EXCEPTION 'Select up to 50 PIs' USING ERRCODE = '22023';
        END IF;
        SELECT coalesce(array_agg(DISTINCT value), '{}'::text[]) INTO v_pi_ids
        FROM jsonb_array_elements_text(p_data->'pi_author_ids');
        -- Hold author keys until commit so deletion cannot race validation.
        PERFORM 1 FROM public.authors WHERE id = ANY(v_pi_ids) FOR KEY SHARE;
        IF EXISTS (SELECT 1 FROM unnest(v_pi_ids) selected(id)
                   WHERE NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = selected.id)) THEN
            RAISE EXCEPTION 'Selected PI not found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF p_data ? 'websites' THEN
        IF jsonb_typeof(p_data->'websites') IS DISTINCT FROM 'array'
           OR jsonb_array_length(p_data->'websites') > 20 THEN
            RAISE EXCEPTION 'Add up to 20 websites' USING ERRCODE = '22023';
        END IF;
        SELECT coalesce(array_agg(value ORDER BY position), '{}'::text[]) INTO v_websites
        FROM (SELECT value, min(ordinality) AS position
              FROM jsonb_array_elements_text(p_data->'websites') WITH ORDINALITY
              GROUP BY value) urls;
        IF EXISTS (SELECT 1 FROM unnest(v_websites) url
                   WHERE url IS NULL OR length(url) > 2083 OR url !~* '^https?://[^[:space:]]+$') THEN
            RAISE EXCEPTION 'Websites must be HTTP or HTTPS URLs' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.labs SET
        name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
        description = CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE description END,
        websites = coalesce(v_websites, websites)
    WHERE id = p_lab_id;
    IF v_pi_ids IS NOT NULL THEN
        DELETE FROM public.lab_principal_investigators WHERE lab_id = p_lab_id
            AND NOT (author_id = ANY(v_pi_ids));
        INSERT INTO public.lab_principal_investigators (lab_id, author_id)
        SELECT p_lab_id, unnest(v_pi_ids) ON CONFLICT DO NOTHING;
    END IF;
    SELECT to_jsonb(d) INTO v_result FROM public.lab_details d WHERE id = p_lab_id;
    RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
