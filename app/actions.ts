"use server";

import { revalidatePath } from "next/cache";

import { getLeaderboard } from "@/lib/data";
import { CURRENT_VERSION } from "@/app/versions";
import { createClient } from "@/lib/supabase/server";
import type { GameSaveState, LeaderboardRun } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You need to sign in first.");
  return { supabase, user: data.user };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<ActionResult> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter your email address." };
  if (!password) return { ok: false, error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<ActionResult> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter your email address." };
  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: trimmed, password });
  if (!error && !data.session) {
    return { ok: false, error: "Account created, but automatic sign-in is disabled. Check the Supabase email confirmation setting." };
  }

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

export async function saveDisplayName(
  displayName: string,
): Promise<ActionResult> {
  const name = displayName.trim();
  if (name.length < 2 || name.length > 24) {
    return { ok: false, error: "Pick a name between 2 and 24 characters." };
  }

  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: name }, { onConflict: "id" });

    if (error) {
      return {
        ok: false,
        error:
          error.code === "23505"
            ? "That name is already claimed by another guardian."
            : error.message,
      };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function markVersionSeen(versionId: string): Promise<ActionResult> {
  if (!/^\d+\.\d+\.\d+$/.test(versionId)) {
    return { ok: false, error: "Invalid version identifier." };
  }

  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("profiles")
      .update({ last_seen_version_id: versionId })
      .eq("id", user.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function saveGameState(
  state: GameSaveState,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("game_saves").upsert(
      { user_id: user.id, state, wave: state.wave },
      { onConflict: "user_id" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function clearGameState(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("game_saves")
      .delete()
      .eq("user_id", user.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export type SubmitRunResult =
  | { ok: true; leaderboard: LeaderboardRun[] }
  | { ok: false; error: string };

export type RunSubmission = Pick<
  GameSaveState,
  "wave" | "seed" | "towers" | "buffs" | "stats"
>;

export async function submitRun(run: RunSubmission): Promise<SubmitRunResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("game_runs").insert({
      user_id: user.id,
      wave: run.wave,
      seed: run.seed,
      towers: run.towers,
      buffs: run.buffs,
      stats: run.stats,
      game_version: CURRENT_VERSION.version,
    });
    if (error) return { ok: false, error: error.message };

    // A finished run has nothing left to resume.
    await supabase.from("game_saves").delete().eq("user_id", user.id);

    return { ok: true, leaderboard: await getLeaderboard() };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardRun[]> {
  return getLeaderboard();
}
