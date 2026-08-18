import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteCustomer } from "@/components/confirm-delete-customer";
import { date, status, won } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const supabase = await createClient();
  const [{ data: customer }, { data: inquiries }, { data: jobs }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("inquiries")
        .select("*")
        .eq("customer_id", id)
        .order("inquiry_date", { ascending: false }),
      supabase
        .from("jobs")
        .select("*")
        .eq("customer_id", id)
        .order("job_date", { ascending: false }),
    ]);

  if (!customer) notFound();

  const details = [
    ["연락처", customer.phone],
    ["주소", customer.address || "-"],
    ["아파트", customer.apartment_name || "-"],
    ["평수", `${customer.area_pyeong || "-"}평`],
    ["메모", customer.memo || "-"],
  ];

  return (
    <div className="page space-y-5">
      <header className="page-header">
        <div>
          <p className="eyebrow">CUSTOMER</p>
          <h1 className="page-title">{customer.name}</h1>
          <p className="page-description">등록 {date(customer.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <Link className="ui-button" href={`/customers/${id}/edit`}>
            수정
          </Link>
          <ConfirmDeleteCustomer id={id} />
        </div>
      </header>

      <section className="ui-card p-5">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {details.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-slate-400">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold text-slate-700">
                {label === "연락처" ? (
                  <a className="text-blue-600" href={`tel:${customer.phone}`}>
                    {value}
                  </a>
                ) : (
                  value
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-card p-5">
        <h2 className="form-section-title">문의 이력</h2>
        {!inquiries?.length ? (
          <p className="empty-state">등록된 문의가 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {inquiries.map((inquiry) => (
              <Link
                className="flex items-center justify-between rounded-xl p-3 hover:bg-slate-50"
                href={`/inquiries/${inquiry.id}/edit`}
                key={inquiry.id}
              >
                <span>
                  <b className="text-sm">
                    {inquiry.apartment_name || "현장 미입력"}
                  </b>
                  <small className="ml-2 text-slate-400">
                    {date(inquiry.inquiry_date)} · {won(inquiry.estimated_amount)}
                  </small>
                </span>
                <span className={`status-badge status-${inquiry.status}`}>
                  {status[inquiry.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="ui-card p-5">
        <h2 className="form-section-title">작업 이력</h2>
        {!jobs?.length ? (
          <p className="empty-state">등록된 작업이 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {jobs.map((job) => (
              <Link
                className="block rounded-xl p-3 hover:bg-slate-50"
                href={`/jobs/${job.id}`}
                key={job.id}
              >
                <b className="text-sm">
                  {date(job.job_date)} · {job.service_type || "작업"}
                </b>
                <p className="data-secondary">
                  {job.apartment_name || "현장 미입력"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
