import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getBestWave,
  getLeaderboard,
  getProfile,
  getSavedGame,
  getSessionUser,
} from "@/lib/data";

import NatureDefenseGame from "./game";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host =
    incomingHeaders.get("x-forwarded-host") ??
    incomingHeaders.get("host") ??
    "localhost";
  const protocol =
    incomingHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Nature's Last Stand";
  const description =
    "Build a living maze of animal guardians and cleanse endless waves of whimsical Blightlings before they reach the Heartwood.";

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  if (!profile?.display_name) redirect("/profile");

  const [savedGame, leaderboard, bestWave] = await Promise.all([
    getSavedGame(user.id),
    getLeaderboard(),
    getBestWave(user.id),
  ]);

  return (
    <NatureDefenseGame
      displayName={profile.display_name}
      email={user.email ?? ""}
      savedGame={savedGame}
      initialLeaderboard={leaderboard}
      bestWave={bestWave}
    />
  );
}
