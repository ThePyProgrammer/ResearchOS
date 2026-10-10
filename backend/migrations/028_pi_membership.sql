-- Run after 027_lab_details.sql. Safe to rerun.
-- PIs are members. Existing PI assignments gain membership without linking papers.
BEGIN;

INSERT INTO public.lab_members (lab_id, author_id)
SELECT lab_id, author_id FROM public.lab_principal_investigators
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_lab_pi_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    INSERT INTO public.lab_members(lab_id, author_id)
    VALUES (NEW.lab_id, NEW.author_id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_pi_membership ON public.lab_principal_investigators;
CREATE TRIGGER lab_pi_membership BEFORE INSERT OR UPDATE
ON public.lab_principal_investigators FOR EACH ROW
EXECUTE FUNCTION public.ensure_lab_pi_membership();

-- Removing a membership also removes its PI role; removing only the PI role
-- leaves the author as an ordinary member. Author/lab deletion still cascades.
ALTER TABLE public.lab_principal_investigators
    DROP CONSTRAINT IF EXISTS lab_pi_membership_fk;
ALTER TABLE public.lab_principal_investigators
    ADD CONSTRAINT lab_pi_membership_fk FOREIGN KEY (lab_id, author_id)
    REFERENCES public.lab_members(lab_id, author_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.add_lab_pi(p_lab_id TEXT, p_author_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
    -- Serialize with detail saves and other role changes; no lost PI updates.
    PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    PERFORM 1 FROM public.authors WHERE id = p_author_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Author not found' USING ERRCODE = 'P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lab_principal_investigators
                   WHERE lab_id = p_lab_id AND author_id = p_author_id)
       AND (SELECT count(*) FROM public.lab_principal_investigators WHERE lab_id = p_lab_id) >= 50 THEN
        RAISE EXCEPTION 'Select up to 50 PIs' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lab_principal_investigators(lab_id, author_id)
    VALUES (p_lab_id, p_author_id) ON CONFLICT DO NOTHING;
    SELECT to_jsonb(d) INTO result FROM public.lab_details d WHERE id = p_lab_id;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_lab_pi(p_lab_id TEXT, p_author_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
    PERFORM 1 FROM public.labs WHERE id = p_lab_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    DELETE FROM public.lab_principal_investigators WHERE lab_id = p_lab_id AND author_id = p_author_id;
    SELECT to_jsonb(d) INTO result FROM public.lab_details d WHERE id = p_lab_id;
    RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
