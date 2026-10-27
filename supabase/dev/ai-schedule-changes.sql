BEGIN;
CREATE TABLE IF NOT EXISTS public.dev_ai_schedule_decisions (
 message_id uuid NOT NULL REFERENCES public.telegram_schedule_messages(id) ON DELETE CASCADE,
 revision_at timestamptz NOT NULL, decision text NOT NULL CHECK(decision IN ('approve','reject')),
 before_fields jsonb, after_fields jsonb, actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 decided_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,revision_at)
);
ALTER TABLE public.dev_ai_schedule_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dev_ai_schedule_decisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.dev_ai_schedule_decisions TO service_role;
CREATE OR REPLACE FUNCTION public.dev_decide_ai_change(p_id uuid,p_revision timestamptz,p_fields jsonb,p_actor uuid,
 p_decision text,p_base_revision timestamptz,p_base_fields jsonb,p_customer uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE source public.telegram_schedule_messages; approved public.dev_ai_schedule_approvals;
 linked public.dev_ai_schedule_job_links; job public.jobs; previous public.dev_ai_schedule_decisions; customer uuid;
BEGIN
 PERFORM public.dev_require_ai_admin(p_actor);
 PERFORM pg_advisory_xact_lock(20261027,1);
 SELECT * INTO source FROM public.telegram_schedule_messages WHERE id=p_id FOR UPDATE;
 IF source.id IS NULL OR source.revision_at<>p_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
 -- Omitted optional scope means retain the approved scope, including on retries.
 IF jsonb_typeof(p_fields)='object' AND NOT (p_fields ? 'scope') AND p_base_fields ? 'scope' THEN
  p_fields:=p_fields||jsonb_build_object('scope',p_base_fields->'scope');
 END IF;
 SELECT * INTO previous FROM public.dev_ai_schedule_decisions WHERE message_id=p_id AND revision_at=p_revision;
 IF FOUND THEN
  IF previous.decision=p_decision AND previous.after_fields IS NOT DISTINCT FROM p_fields AND previous.before_fields IS NOT DISTINCT FROM p_base_fields THEN RETURN; END IF;
  RAISE EXCEPTION 'already_decided';
 END IF;
 SELECT * INTO approved FROM public.dev_ai_schedule_approvals WHERE message_id=p_id;
 IF approved.revision_at IS DISTINCT FROM p_base_revision OR approved.fields IS DISTINCT FROM p_base_fields THEN RAISE EXCEPTION 'stale_approval'; END IF;
 IF p_decision='reject' THEN
  INSERT INTO public.dev_ai_schedule_decisions VALUES(p_id,p_revision,p_decision,approved.fields,p_fields,p_actor,now());
  UPDATE public.telegram_schedule_messages SET status=CASE WHEN approved.message_id IS NULL THEN 'ignored' ELSE 'reviewed' END WHERE id=p_id;
  RETURN;
 END IF;
 IF p_decision<>'approve' OR p_decision IS NULL THEN RAISE EXCEPTION 'invalid_decision'; END IF;
 SELECT * INTO linked FROM public.dev_ai_schedule_job_links WHERE message_id=p_id;
 IF linked.message_id IS NOT NULL THEN
  SELECT * INTO job FROM public.jobs WHERE id=linked.job_id FOR UPDATE;
  IF job.id IS NULL OR job.status<>'scheduled' OR job.final_amount IS NOT NULL OR
    EXISTS(SELECT 1 FROM public.sales WHERE job_id=job.id) OR
    job.customer_id<>linked.customer_id OR job.job_date<>(linked.fields->>'date')::date OR
    job.start_time IS DISTINCT FROM (linked.fields->>'time')::time OR
    job.address IS DISTINCT FROM linked.fields->>'address' OR job.service_type IS DISTINCT FROM linked.fields->>'service' OR
    job.expected_amount IS DISTINCT FROM (linked.fields->>'amount')::integer OR
    coalesce(job.work_scope,'')<>coalesce(linked.fields->>'scope','') OR job.apartment_name IS DISTINCT FROM linked.fields->>'site'
    THEN RAISE EXCEPTION 'crm_changed_review_required'; END IF;
  customer:=linked.customer_id;
  IF p_fields->>'customer' IS DISTINCT FROM linked.fields->>'customer' OR p_customer IS NOT NULL THEN
   IF p_customer IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=p_customer AND
     regexp_replace(lower(c.name),'\s','','g')=regexp_replace(lower(p_fields->>'customer'),'\s','','g')) THEN
     RAISE EXCEPTION 'customer_selection_required'; END IF;
   SELECT id INTO customer FROM public.customers WHERE id=p_customer FOR SHARE;
   IF customer IS NULL THEN RAISE EXCEPTION 'customer_selection_required'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.jobs j WHERE j.id<>job.id AND j.status NOT IN ('cancelled','completed') AND
    j.job_date=(p_fields->>'date')::date AND (NOT EXISTS(SELECT 1 FROM public.dev_ai_schedule_job_links l WHERE l.job_id=j.id) OR j.start_time IS NULL OR j.start_time=(p_fields->>'time')::time)) THEN
    RAISE EXCEPTION 'crm_time_conflict'; END IF;
 END IF;
 PERFORM public.dev_apply_ai_schedule(p_id,p_revision,p_fields,p_actor);
 IF linked.message_id IS NOT NULL THEN
  UPDATE public.jobs SET customer_id=customer,job_date=(p_fields->>'date')::date,start_time=(p_fields->>'time')::time,
    service_type=p_fields->>'service',address=p_fields->>'address',apartment_name=p_fields->>'site',expected_amount=(p_fields->>'amount')::integer,
    work_scope=CASE WHEN p_fields ? 'scope' THEN p_fields->>'scope' ELSE work_scope END WHERE id=job.id;
  UPDATE public.dev_ai_schedule_job_links SET customer_id=customer,revision_at=p_revision,fields=p_fields WHERE message_id=p_id;
 END IF;
 INSERT INTO public.dev_ai_schedule_decisions VALUES(p_id,p_revision,p_decision,approved.fields,p_fields,p_actor,now());
END; $$;
REVOKE ALL ON FUNCTION public.dev_decide_ai_change(uuid,timestamptz,jsonb,uuid,text,timestamptz,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dev_decide_ai_change(uuid,timestamptz,jsonb,uuid,text,timestamptz,jsonb,uuid) TO service_role;
COMMIT;
