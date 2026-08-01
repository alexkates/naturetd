export type TowerKind = "thorn" | "frost" | "boulder" | "lightning";
export type SpellKind = "solar" | "ice" | "tornado" | "bloom";
export type BuffKind =
  | "sunseed"
  | "threeSeed"
  | "shatterfrost"
  | "longWinter"
  | "faultline"
  | "aftershock"
  | "echoHowl"
  | "packCircuit"
  | "ancientSap"
  | "tailwind"
  | "longRoots"
  | "gildedPollen"
  | "sunCrowned"
  | "deepFreeze"
  | "stormShepherd"
  | "verdantMercy";

export type SavedTower = {
  x: number;
  y: number;
  kind: TowerKind;
  level: number;
  kills: number;
  damageDone: number;
  spent?: number;
};

export type RunStats = {
  kills: number;
  damage: number;
  goldEarned: number;
  goldSpent: number;
  towersBuilt: number;
  towerUpgrades: number;
  bossesDefeated: number;
  battleTime: number;
  spellsCast: number;
  wavesRushed: number;
  rushGold: number;
  timeSaved: number;
};

export type LeaderboardRun = {
  id: string;
  name: string;
  playedAt: string;
  wave: number;
  seed: number;
  towers: SavedTower[];
  buffs: BuffKind[];
  stats: RunStats;
};

/**
 * Snapshot of a run taken between waves. Live wave state (in-flight
 * Blightlings, projectiles, spell effects) is intentionally not stored — a
 * resumed run always picks up at the start of an intermission.
 */
export type GameSaveState = {
  version: 1;
  seed: number;
  wave: number;
  gold: number;
  health: number;
  bestWave: number;
  towers: SavedTower[];
  buffs: BuffKind[];
  spellCharges: Record<SpellKind, number>;
  spellCasts: Record<SpellKind, number>;
  stats: RunStats;
};

export type Profile = {
  id: string;
  display_name: string;
  last_seen_release_id: string | null;
};
