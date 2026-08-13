import { redirect } from "next/navigation";

import {
  getBestWave,
  getLeaderboard,
  getProfile,
  getSavedGame,
  getSessionUser,
} from "@/lib/data";

import NatureDefenseGame from "./game";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);

  const [savedGame, leaderboard, bestWave] = await Promise.all([
    getSavedGame(user.id),
    getLeaderboard(),
    getBestWave(user.id),
  ]);

  return (
    <NatureDefenseGame
      displayName={profile?.display_name ?? ""}
      isNewProfile={!profile?.display_name}
      savedGame={savedGame}
      initialLeaderboard={leaderboard}
      bestWave={bestWave}
      lastSeenVersionId={profile?.last_seen_version_id ?? null}
    />
  );
}
