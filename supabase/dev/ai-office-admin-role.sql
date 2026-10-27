-- LOCAL SYNTHETIC fixture. No self-service role grants; no production changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dev_ai_office_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_ai_office_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dev_ai_office_admins FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.dev_ai_office_admins TO service_role;
CREATE OR REPLACE FUNCTION public.dev_ai_office_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.dev_ai_office_admins WHERE user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.dev_ai_office_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dev_ai_office_admin() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.dev_require_ai_admin(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM user_id FROM public.dev_ai_office_admins WHERE user_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.dev_require_ai_admin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_require_ai_admin(uuid) TO service_role;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['customers','jobs','inquiries','sales'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS dev_admin_insert ON public.%I',tab);
  EXECUTE format('DROP POLICY IF EXISTS dev_admin_update ON public.%I',tab);
  EXECUTE format('DROP POLICY IF EXISTS dev_admin_delete ON public.%I',tab);
  EXECUTE format('CREATE POLICY dev_admin_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.dev_ai_office_admin())',tab);
  EXECUTE format('CREATE POLICY dev_admin_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.dev_ai_office_admin()) WITH CHECK(public.dev_ai_office_admin())',tab);
  EXECUTE format('CREATE POLICY dev_admin_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.dev_ai_office_admin())',tab);
 END LOOP;
END; $$;
COMMIT;
