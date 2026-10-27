-- LOCAL SYNTHETIC DATABASE ONLY. Deliberately excluded from production migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dev_ai_schedule_approvals (
  message_id uuid PRIMARY KEY REFERENCES public.telegram_schedule_messages(id) ON DELETE CASCADE,
  revision_at timestamptz NOT NULL,
  fields jsonb NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
-- Offboarding a reviewer must not delete approved business records.
ALTER TABLE public.dev_ai_schedule_approvals ALTER COLUMN reviewed_by DROP NOT NULL;
ALTER TABLE public.dev_ai_schedule_approvals DROP CONSTRAINT IF EXISTS dev_ai_schedule_approvals_reviewed_by_fkey;
ALTER TABLE public.dev_ai_schedule_approvals ADD CONSTRAINT dev_ai_schedule_approvals_reviewed_by_fkey
  FOREIGN KEY(reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.dev_ai_schedule_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dev_ai_schedule_approvals FROM anon, authenticated;
GRANT ALL ON public.dev_ai_schedule_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.dev_apply_ai_schedule(p_id uuid,p_revision timestamptz,p_fields jsonb,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE source public.telegram_schedule_messages; starts timestamp; minutes integer;
BEGIN
  PERFORM public.dev_require_ai_admin(p_actor);
  -- Serialize approvals and lock the inbox row against concurrent webhook edits.
  PERFORM pg_advisory_xact_lock(20261027,1);
  SELECT * INTO source FROM public.telegram_schedule_messages WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR source.revision_at<>p_revision OR source.status='ignored' THEN
    RAISE EXCEPTION 'stale_revision' USING ERRCODE='P0001';
  END IF;
  IF jsonb_typeof(p_fields)<>'object' OR
    NOT (p_fields ?& ARRAY['date','time','customer','address','site','service','amount','duration']) OR
    EXISTS (SELECT 1 FROM unnest(ARRAY['customer','address','site','service']) k
      WHERE coalesce(jsonb_typeof(p_fields->k),'null')<>'string' OR coalesce(length(btrim(p_fields->>k)),0) NOT BETWEEN 1 AND 300) OR
    coalesce(p_fields->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' OR
    coalesce(p_fields->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
    coalesce(p_fields->>'amount','') !~ '^[0-9]+$' OR
    coalesce(p_fields->>'duration','') !~ '^[0-9]+$' OR
    (p_fields ? 'scope' AND (jsonb_typeof(p_fields->'scope')<>'string' OR length(p_fields->>'scope')>300)) THEN
    RAISE EXCEPTION 'invalid_fields' USING ERRCODE='P0001';
  END IF;
  minutes:=(p_fields->>'duration')::integer;
  IF minutes NOT BETWEEN 1 AND 1440 OR (p_fields->>'amount')::numeric>1000000000 THEN
    RAISE EXCEPTION 'invalid_fields' USING ERRCODE='P0001';
  END IF;
  starts:=((p_fields->>'date')||' '||(p_fields->>'time'))::timestamp;
  IF EXISTS (
    SELECT 1 FROM public.dev_ai_schedule_approvals a JOIN public.telegram_schedule_messages m
      ON m.id=a.message_id
    WHERE a.message_id<>p_id
      AND starts < ((a.fields->>'date')||' '||(a.fields->>'time'))::timestamp + (a.fields->>'duration')::integer * interval '1 minute'
      AND ((a.fields->>'date')||' '||(a.fields->>'time'))::timestamp < starts + minutes*interval '1 minute'
  ) THEN RAISE EXCEPTION 'schedule_conflict' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.dev_ai_schedule_approvals(message_id,revision_at,fields,reviewed_by)
    VALUES(p_id,p_revision,p_fields,p_actor)
    ON CONFLICT(message_id) DO UPDATE SET revision_at=excluded.revision_at,fields=excluded.fields,
      reviewed_by=excluded.reviewed_by,approved_at=now();
  UPDATE public.telegram_schedule_messages SET status='reviewed' WHERE id=p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dev_apply_ai_schedule(uuid,timestamptz,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_apply_ai_schedule(uuid,timestamptz,jsonb,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.dev_approve_ai_schedule(p_id uuid,p_revision timestamptz,p_fields jsonb,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.dev_require_ai_admin(p_actor);
 PERFORM pg_advisory_xact_lock(20261027,1);
 IF EXISTS(SELECT 1 FROM public.dev_ai_schedule_job_links WHERE message_id=p_id) THEN
   RAISE EXCEPTION 'change_approval_required' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.dev_ai_schedule_approvals WHERE message_id=p_id AND revision_at<>p_revision) THEN
   RAISE EXCEPTION 'change_approval_required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.dev_ai_schedule_decisions WHERE message_id=p_id AND revision_at=p_revision) THEN
   RAISE EXCEPTION 'change_approval_required';
 END IF;
 PERFORM public.dev_apply_ai_schedule(p_id,p_revision,p_fields,p_actor);
END; $$;
REVOKE ALL ON FUNCTION public.dev_approve_ai_schedule(uuid,timestamptz,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_approve_ai_schedule(uuid,timestamptz,jsonb,uuid) TO service_role;
COMMIT;
