import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/data";
import { supabaseConfigured } from "@/lib/supabase/config";

import SignInForm from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (supabaseConfigured) {
    const user = await getSessionUser();
    if (user) redirect("/");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">ND</div>
          <h1>Nature&apos;s Last Stand</h1>
        </div>
        <p className="eyebrow">Grove keepers only</p>
        <h2>Sign in to defend the Heartwood</h2>
        <p className="auth-copy">
          Your runs, your maze, and your place on the leaderboard follow you
          across devices.
        </p>
        {supabaseConfigured ? (
          <SignInForm initialError={error} />
        ) : (
          <p className="auth-error" role="alert">
            Supabase is not configured for this deployment. Set
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable
            sign-in.
          </p>
        )}
      </section>
    </main>
  );
}
