"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startAnonymousGame } from "@/app/actions";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await startAnonymousGame(name);
      if (result.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="guardian-name">Guardian name</label>
      <input id="guardian-name" autoComplete="nickname" placeholder="Fern Warden" minLength={2} maxLength={24} value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Entering…" : "Enter the grove"}
      </button>
      {error ? <p className="auth-error" role="alert">{error}</p> : <p className="auth-hint">No account needed. Progress stays with this browser.</p>}
    </form>
  );
}
