"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    if (error) {
      setErrorMessage("이메일 또는 비밀번호를 확인해 주세요.");
      setIsLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
      <form onSubmit={handleSubmit} className="ui-card w-full max-w-[420px] p-7 sm:p-9">
        <div className="mb-9">
          <span className="grid size-11 place-items-center rounded-xl bg-blue-500 font-black text-white">MC</span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-.04em]">맑은하늘클린</h1>
          <p className="mt-1 text-sm text-slate-500">업무관리 시스템에 로그인하세요.</p>
        </div>
        <label className="ui-label">
          이메일
          <input required name="email" type="email" autoComplete="email" className="ui-input mt-2" />
        </label>
        <label className="ui-label mt-5">
          비밀번호
          <input required name="password" type="password" autoComplete="current-password" className="ui-input mt-2" />
        </label>
        <div className="mt-3 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">비밀번호를 잊으셨나요?</Link>
        </div>
        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <button disabled={isLoading} className="ui-button ui-button-primary mt-7 w-full">
          {isLoading ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
