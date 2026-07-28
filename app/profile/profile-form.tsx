"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveDisplayName, signOut } from "@/app/actions";

export default function ProfileForm({
  email,
  displayName,
  isNew,
}: {
  email: string;
  displayName: string;
  isNew: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveDisplayName(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      if (isNew) router.push("/");
      else router.refresh();
    });
  };

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="display-name">Leaderboard name</label>
        <input
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Fern Warden"
          minLength={2}
          maxLength={24}
          required
          autoFocus
        />
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Enter the grove" : "Save name"}
        </button>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : saved ? (
          <p className="auth-hint" role="status">
            Name saved.
          </p>
        ) : (
          <p className="auth-hint">
            This is the name shown on every run you post. 2–24 characters, and it
            has to be unique.
          </p>
        )}
      </form>

      <footer className="profile-footer">
        <span>Signed in as {email}</span>
        <div>
          {!isNew && (
            <button type="button" onClick={() => router.push("/")}>
              Back to the grove
            </button>
          )}
          <button
            type="button"
            onClick={() => startTransition(async () => {
              await signOut();
              router.push("/login");
            })}
          >
            Sign out
          </button>
        </div>
      </footer>
    </>
  );
}
