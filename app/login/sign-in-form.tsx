"use client";

import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) setError(authError.message);
      else setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="auth-sent" role="status">
        <span aria-hidden="true">✉</span>
        <h3>Check your email</h3>
        <p>We sent a magic link to <strong>{email.trim()}</strong>.</p>
        <button type="button" onClick={() => setSent(false)}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="auth-email">Email</label>
      <input id="auth-email" type="email" autoComplete="email" inputMode="email" placeholder="keeper@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {error ? <p className="auth-error" role="alert">{error}</p> : <p className="auth-hint">No password needed. Your progress follows your email.</p>}
    </form>
  );
}
