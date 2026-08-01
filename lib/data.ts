import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import type {
  BuffKind,
  GameSaveState,
  LeaderboardRun,
  Profile,
  RunStats,
  SavedTower,
} from "@/lib/types";

export const MAX_LEADERBOARD_RUNS = 10;

type RunRow = {
  id: string;
  played_at: string;
  wave: number;
  seed: number;
  towers: SavedTower[] | null;
  buffs: BuffKind[] | null;
  stats: RunStats | null;
  name: string | null;
};

const EMPTY_STATS: RunStats = {
  kills: 0,
  damage: 0,
  goldEarned: 0,
  goldSpent: 0,
  towersBuilt: 0,
  towerUpgrades: 0,
  bossesDefeated: 0,
  battleTime: 0,
  spellsCast: 0,
  wavesRushed: 0,
  rushGold: 0,
  timeSaved: 0,
};

function toLeaderboardRun(row: RunRow): LeaderboardRun {
  return {
    id: row.id,
    name: row.name ?? "Unknown guardian",
    playedAt: row.played_at,
    wave: row.wave,
    seed: row.seed,
    towers: row.towers ?? [],
    buffs: row.buffs ?? [],
    stats: { ...EMPTY_STATS, ...(row.stats ?? {}) },
  };
}

export async function getSessionUser() {
  if (!supabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, last_seen_version_id")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function getLeaderboard(): Promise<LeaderboardRun[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leaderboard")
    .select(
      "id, played_at, wave, seed, towers, buffs, stats, name",
    )
    .gt("kills", 0)
    .order("kills", { ascending: false })
    .order("wave", { ascending: false })
    .order("damage", { ascending: false })
    .order("battle_time", { ascending: true })
    .limit(MAX_LEADERBOARD_RUNS);

  if (error || !data) return [];
  return (data as RunRow[]).map(toLeaderboardRun);
}

export async function getSavedGame(
  userId: string,
): Promise<GameSaveState | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("game_saves")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();

  const state = data?.state as GameSaveState | undefined;
  return state && state.version === 1 ? state : null;
}

export async function getBestWave(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("game_runs")
    .select("wave")
    .eq("user_id", userId)
    .order("wave", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.wave ?? 0;
}
