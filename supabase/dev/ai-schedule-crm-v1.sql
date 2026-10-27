-- Local synthetic DB fixture only. Not a production migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dev_ai_schedule_job_links (
  message_id uuid PRIMARY KEY REFERENCES public.telegram_schedule_messages(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  revision_at timestamptz NOT NULL, fields jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_ai_schedule_job_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dev_ai_schedule_job_links FROM anon,authenticated;
GRANT ALL ON public.dev_ai_schedule_job_links TO service_role;

CREATE OR REPLACE FUNCTION public.dev_ai_customer_candidates(p_id uuid)
RETURNS TABLE(id uuid,name text,phone text,address text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT c.id,c.name,c.phone,c.address FROM public.customers c
  JOIN public.dev_ai_schedule_approvals a ON a.message_id=p_id
  WHERE regexp_replace(lower(c.name),'\s','','g')=regexp_replace(lower(a.fields->>'customer'),'\s','','g')
    OR regexp_replace(lower(coalesce(c.address,'')),'\s','','g')=regexp_replace(lower(a.fields->>'address'),'\s','','g')
  ORDER BY c.created_at,c.id LIMIT 101;
$$;
REVOKE ALL ON FUNCTION public.dev_ai_customer_candidates(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_ai_customer_candidates(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dev_link_ai_schedule_job(p_id uuid,p_revision timestamptz,p_fields jsonb,
  p_customer uuid,p_phone text,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE source public.telegram_schedule_messages; approval public.dev_ai_schedule_approvals;
  linked public.dev_ai_schedule_job_links; customer uuid; job uuid;
BEGIN
  PERFORM public.dev_require_ai_admin(p_actor);
  PERFORM pg_advisory_xact_lock(20261027,1);
  SELECT * INTO source FROM public.telegram_schedule_messages WHERE id=p_id FOR UPDATE;
  SELECT * INTO approval FROM public.dev_ai_schedule_approvals WHERE message_id=p_id;
  IF source.id IS NULL OR approval.message_id IS NULL OR source.status<>'reviewed'
    OR (source.revision_at<>p_revision AND NOT EXISTS(SELECT 1 FROM public.dev_ai_schedule_decisions d
      WHERE d.message_id=p_id AND d.revision_at=source.revision_at AND d.decision='reject')) OR approval.revision_at<>p_revision
    OR approval.fields IS DISTINCT FROM p_fields THEN
    RAISE EXCEPTION 'stale_approval' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO linked FROM public.dev_ai_schedule_job_links WHERE message_id=p_id;
  IF FOUND THEN
    IF linked.revision_at<>p_revision OR linked.fields IS DISTINCT FROM p_fields THEN
      RAISE EXCEPTION 'linked_job_review_required' USING ERRCODE='P0001';
    END IF;
    RETURN linked.job_id;
  END IF;
  IF p_customer IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.dev_ai_customer_candidates(p_id) c WHERE c.id=p_customer) THEN
      RAISE EXCEPTION 'customer_selection_required' USING ERRCODE='P0001';
    END IF;
    SELECT id INTO customer FROM public.customers WHERE id=p_customer FOR UPDATE;
    IF customer IS NULL THEN RAISE EXCEPTION 'customer_selection_required'; END IF;
  ELSE
    IF p_phone IS NULL OR length(btrim(p_phone)) NOT BETWEEN 7 AND 40 OR
      length(regexp_replace(p_phone,'[^0-9]','','g')) NOT BETWEEN 7 AND 15 THEN RAISE EXCEPTION 'phone_required'; END IF;
    IF EXISTS(SELECT 1 FROM public.dev_ai_customer_candidates(p_id)) OR
      EXISTS(SELECT 1 FROM public.customers c WHERE regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')) THEN
      RAISE EXCEPTION 'customer_duplicate_review' USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.customers(name,phone,address,apartment_name,memo)
      VALUES(p_fields->>'customer',btrim(p_phone),p_fields->>'address',p_fields->>'site','AI 일정 관리자 확인 등록') RETURNING id INTO customer;
  END IF;
  IF EXISTS(SELECT 1 FROM public.jobs j WHERE j.customer_id=customer AND j.job_date=(p_fields->>'date')::date
    AND j.start_time=(p_fields->>'time')::time AND regexp_replace(coalesce(j.address,''),'\s','','g')=regexp_replace(p_fields->>'address','\s','','g')
    AND j.status<>'cancelled') THEN RAISE EXCEPTION 'existing_job_candidate' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.jobs(customer_id,job_date,start_time,service_type,address,apartment_name,expected_amount,status,memo,work_scope)
    VALUES(customer,(p_fields->>'date')::date,(p_fields->>'time')::time,p_fields->>'service',p_fields->>'address',
      p_fields->>'site',(p_fields->>'amount')::integer,'scheduled','AI 일정 검토 승인 · 소요시간 '||(p_fields->>'duration')||'분',p_fields->>'scope') RETURNING id INTO job;
  INSERT INTO public.dev_ai_schedule_job_links(message_id,job_id,customer_id,revision_at,fields,created_by)
    VALUES(p_id,job,customer,p_revision,p_fields,p_actor);
  RETURN job;
END;
$$;
REVOKE ALL ON FUNCTION public.dev_link_ai_schedule_job(uuid,timestamptz,jsonb,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_link_ai_schedule_job(uuid,timestamptz,jsonb,uuid,text,uuid) TO service_role;
COMMIT;
