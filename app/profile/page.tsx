import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getProfile, getSessionUser } from "@/lib/data";

import ProfileForm from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const isNew = !profile?.display_name;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">ND</div>
          <h1>Nature&apos;s Last Stand</h1>
        </div>
        <p className="eyebrow">Guardian profile</p>
        <h2>{isNew ? "Claim your grove name" : "Your grove name"}</h2>
        <p className="auth-copy">
          {isNew
            ? "Every last stand is recorded under this name — pick it before your first run."
            : "Change the name that appears on the leaderboard. Past runs update too."}
        </p>
        <ProfileForm
          email={user.email ?? ""}
          displayName={profile?.display_name ?? ""}
          isNew={isNew}
        />
      </section>
    </main>
  );
}
