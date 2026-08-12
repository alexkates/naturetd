"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signInWithPassword, signUpWithPassword } from "@/app/actions";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = mode === "sign-in"
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);
      if (result.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "sign-in"} onClick={() => { setMode("sign-in"); setError(""); }}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === "sign-up"} onClick={() => { setMode("sign-up"); setError(""); }}>
          Create account
        </button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" inputMode="email" placeholder="keeper@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Entering…" : mode === "sign-in" ? "Enter the grove" : "Join the guardians"}
        </button>
        {error ? <p className="auth-error" role="alert">{error}</p> : <p className="auth-hint">{mode === "sign-up" ? "Use at least 8 characters." : "Your runs and leaderboard place follow your account."}</p>}
      </form>
    </>
  );
}
