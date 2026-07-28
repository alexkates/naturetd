"use client";

import { useState, useTransition } from "react";

import { sendMagicLink } from "@/app/actions";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    setError("");
    startTransition(async () => {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const result = await sendMagicLink(address, redirectTo);
      if (result.ok) setSentTo(address);
      else setError(result.error);
    });
  };

  if (sentTo) {
    return (
      <div className="auth-sent">
        <span aria-hidden="true">✉</span>
        <h2>Check your inbox</h2>
        <p>
          We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this
          device to enter the grove.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="auth-email">Email address</label>
      <input
        id="auth-email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoFocus
      />
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a magic link"}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="auth-hint">
          No passwords. We email you a one-tap link that signs you in.
        </p>
      )}
    </form>
  );
}
