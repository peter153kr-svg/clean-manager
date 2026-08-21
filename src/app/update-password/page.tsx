"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [recoveryState, setRecoveryState] = useState<"checking" | "valid" | "invalid">("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function verifyRecoverySession() {
      const { data, error } = await supabase.auth.getUser();
      setRecoveryState(!error && data.user ? "valid" : "invalid");
    }

    void verifyRecoverySession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (recoveryState !== "valid") {
      setErrorMessage("재설정 링크가 만료되었거나 유효하지 않습니다. 비밀번호 재설정을 다시 요청해 주세요.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password"));
    const passwordConfirmation = String(formData.get("passwordConfirmation"));

    if (password.length < 8) {
      setErrorMessage("새 비밀번호는 8자 이상으로 입력해 주세요.");
      return;
    }
    if (password !== passwordConfirmation) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage("비밀번호를 변경하지 못했습니다. 비밀번호 재설정을 다시 요청해 주세요.");
      setIsLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (recoveryState === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
        <section className="ui-card w-full max-w-[420px] p-7 text-center sm:p-9">
          <p className="text-sm text-slate-500">재설정 링크를 확인하고 있습니다…</p>
        </section>
      </main>
    );
  }

  if (recoveryState === "invalid") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
        <section className="ui-card w-full max-w-[420px] p-7 sm:p-9">
          <p className="eyebrow">INVALID LINK</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em]">재설정 링크를 확인해 주세요</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">재설정 링크가 만료되었거나 유효하지 않습니다. 비밀번호 재설정을 다시 요청해 주세요.</p>
          <Link href="/forgot-password" className="ui-button ui-button-primary mt-7 w-full">비밀번호 재설정 다시 요청</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
      <form onSubmit={handleSubmit} className="ui-card w-full max-w-[420px] p-7 sm:p-9">
        <div className="mb-9">
          <span className="grid size-11 place-items-center rounded-xl bg-blue-500 font-black text-white">MC</span>
          <p className="eyebrow mt-5">NEW PASSWORD</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em]">새 비밀번호 설정</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">안전한 새 비밀번호를 입력해 주세요.</p>
        </div>
        <label className="ui-label">
          새 비밀번호
          <input required name="password" type="password" minLength={8} autoComplete="new-password" className="ui-input mt-2" />
        </label>
        <label className="ui-label mt-5">
          새 비밀번호 확인
          <input required name="passwordConfirmation" type="password" minLength={8} autoComplete="new-password" className="ui-input mt-2" />
        </label>
        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <button disabled={isLoading} className="ui-button ui-button-primary mt-7 w-full">
          {isLoading ? "비밀번호 변경 중…" : "새 비밀번호 저장"}
        </button>
        <Link href="/login" className="mt-5 block text-center text-sm font-medium text-slate-500 hover:text-slate-700">로그인으로 돌아가기</Link>
      </form>
    </main>
  );
}
