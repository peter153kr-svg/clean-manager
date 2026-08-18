"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setErrorMessage("");

    const email = String(new FormData(event.currentTarget).get("email"));
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setErrorMessage("재설정 이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setIsLoading(false);
      return;
    }

    setMessage("비밀번호 재설정 이메일을 보냈습니다. 받은 편지함을 확인해 주세요.");
    setIsLoading(false);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
      <form onSubmit={handleSubmit} className="ui-card w-full max-w-[420px] p-7 sm:p-9">
        <div className="mb-9">
          <span className="grid size-11 place-items-center rounded-xl bg-blue-500 font-black text-white">MC</span>
          <p className="eyebrow mt-5">PASSWORD RESET</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em]">비밀번호 재설정</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">로그인에 사용하는 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
        </div>
        <label className="ui-label">
          이메일
          <input required name="email" type="email" autoComplete="email" className="ui-input mt-2" />
        </label>
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <button disabled={isLoading} className="ui-button ui-button-primary mt-7 w-full">
          {isLoading ? "이메일 보내는 중…" : "재설정 이메일 보내기"}
        </button>
        <Link href="/login" className="mt-5 block text-center text-sm font-medium text-slate-500 hover:text-slate-700">로그인으로 돌아가기</Link>
      </form>
    </main>
  );
}
