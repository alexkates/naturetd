"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  fetchLeaderboard,
  markReleaseSeen,
  saveDisplayName,
  saveGameState,
  signOut,
  submitRun,
} from "@/app/actions";
import type { BlightKind } from "@/app/art";
import {
  drawBlightling,
  drawGrass,
  drawGuardian,
  drawHealthBar,
  drawHeartwood,
  drawNest,
  drawRift,
  drawShot,
} from "@/app/art";
import { CURRENT_RELEASE } from "@/app/releases";
import type {
  BuffKind,
  GameSaveState,
  LeaderboardRun,
  RunStats,
  SavedTower,
  SpellKind,
  TowerKind,
} from "@/lib/types";

const COLS = 20;
const ROWS = 10;
const CELL = 40;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const START = { x: 0, y: 4 };
const CITY = { x: 19, y: 5 };
const MAX_PENDING_BLIGHTLINGS = 240;
const MAX_HEALTH = 20;

type Point = { x: number; y: number };
type Phase = "intermission" | "wave" | "gameover";

type Tower = {
  kind: TowerKind;
  level: number;
  spent: number;
  cooldown: number;
  damageDone: number;
  kills: number;
};

type Enemy = {
  id: number;
  invader: Invader;
  path: Point[];
  pathIndex: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  bounty: number;
  cityDamage: number;
  slowUntil: number;
  slowFactor: number;
  stunUntil: number;
  blindUntil: number;
  dead: boolean;
};

type SpellEffect =
  | { kind: "solar"; center: Point; startedAt: number; endsAt: number }
  | {
      kind: "ice";
      center: Point;
      startedAt: number;
      endsAt: number;
      nextTick: number;
    }
  | {
      kind: "tornado";
      x: number;
      y: number;
      angle: number;
      turnAt: number;
      endsAt: number;
      hits: Record<number, number>;
      resetsLeft: number;
    }
  | { kind: "bloom"; startedAt: number; endsAt: number };

type Projectile = {
  from: Point;
  to: Point;
  kind: TowerKind;
  age: number;
  duration: number;
  /** Keeps a bolt's jitter and a pellet's spin stable for its whole life. */
  seed: number;
  arc?: boolean;
};

type Invader = {
  name: string;
  art: BlightKind;
  hp: number;
  speed: number;
  bounty: number;
  unlock: number;
  cityDamage?: number;
};

type WaveAnnouncement = {
  wave: number;
  total: number;
  levelBonus: number;
  bossWave: boolean;
  roster: { invader: Invader; count: number }[];
  earlyBonus: number;
  rushStreak: number;
  rushMultiplier: number;
  expiresAt: number;
};

type Game = {
  gold: number;
  health: number;
  wave: number;
  phase: Phase;
  towers: Map<string, Tower>;
  enemies: Enemy[];
  projectiles: Projectile[];
  waveQueue: Invader[];
  spawnClock: number;
  spawnInterval: number;
  seed: number;
  rng: () => number;
  elapsed: number;
  paused: boolean;
  speed: number;
  kills: number;
  damage: number;
  realElapsed: number;
  goldEarned: number;
  goldSpent: number;
  rushGold: number;
  timeSaved: number;
  wavesRushed: number;
  rushStreak: number;
  lastRushAt: number;
  towersBuilt: number;
  towerUpgrades: number;
  bestWave: number;
  message: string;
  messageUntil: number;
  route: Point[];
  nextWaveIn: number;
  wavePeriod: number;
  waveAnnouncement: WaveAnnouncement | null;
  spellCharges: Record<SpellKind, number>;
  spellCasts: Record<SpellKind, number>;
  spellEffects: SpellEffect[];
  spellsCast: number;
  buffs: BuffKind[];
  pendingBuffChoices: BuffKind[] | null;
  bossesDefeated: number;
};

const BLIGHTLINGS: Invader[] = [
  { name: "Muckling", art: "muckling", hp: 0.7, speed: 1, bounty: 4, unlock: 1 },
  { name: "Cinderling", art: "cinderling", hp: 0.52, speed: 1.42, bounty: 5, unlock: 1 },
  { name: "Scrapbug", art: "scrapbug", hp: 1.15, speed: 0.7, bounty: 8, unlock: 1 },
  { name: "Sporefiend", art: "sporefiend", hp: 0.95, speed: 0.92, bounty: 7, unlock: 2 },
  { name: "Smogbat", art: "smogbat", hp: 0.7, speed: 1.62, bounty: 7, unlock: 4, cityDamage: 2 },
];

const BOSS: Invader = {
  name: "The Grime King",
  art: "grimeKing",
  hp: 18,
  speed: 0.58,
  bounty: 275,
  unlock: 5,
  cityDamage: 5,
};

const TOWER_DATA: Record<
  TowerKind,
  {
    name: string;
    cost: number;
    color: string;
    tag: string;
    description: string;
    damage: number;
    rate: number;
    range: number;
    hotkey: string;
  }
> = {
  thorn: {
    name: "Chickadee Bramble",
    cost: 35,
    color: "#8fbf3f",
    tag: "Single target · fast",
    description: "Chicks fling cleansing seeds",
    damage: 7,
    rate: 3.1,
    range: 2.35,
    hotkey: "1",
  },
  frost: {
    name: "Foxglove Den",
    cost: 55,
    color: "#4fc3e8",
    tag: "Single target · slow",
    description: "Snow foxes calm and slow",
    damage: 4,
    rate: 1.25,
    range: 2.8,
    hotkey: "2",
  },
  boulder: {
    name: "Boarstone Burrow",
    cost: 65,
    color: "#e08c3c",
    tag: "Splash · heavy hit",
    description: "Boars scatter cleansing pollen",
    damage: 18,
    rate: 0.58,
    range: 3,
    hotkey: "3",
  },
  lightning: {
    name: "Wolfwood Roost",
    cost: 85,
    color: "#e0b23a",
    tag: "Chain · multi-target",
    description: "Wolves chain bright spirit sparks",
    damage: 8,
    rate: 0.92,
    range: 2.85,
    hotkey: "4",
  },
};

const TOWER_ORDER = Object.keys(TOWER_DATA) as TowerKind[];
const SPELL_DATA: Record<SpellKind, {
  name: string;
  cost: number;
  icon: string;
  color: string;
  tag: string;
  description: string;
  hotkey: string;
  radius?: number;
}> = {
  solar: {
    name: "Solar Flare",
    cost: 320,
    icon: "☀",
    color: "#ffd35a",
    tag: "AoE · stun",
    description: "18-target blast · stun up to 32",
    hotkey: "⇧1",
    radius: 4.2,
  },
  ice: {
    name: "Ice Storm",
    cost: 415,
    icon: "❄",
    color: "#8ee8ff",
    tag: "AoE · slow",
    description: "6 capped damage waves · heavy slow",
    hotkey: "⇧2",
    radius: 3.5,
  },
  tornado: {
    name: "Wild Tornadoes",
    cost: 600,
    icon: "◉",
    color: "#d8f5c0",
    tag: "Roaming · pushback",
    description: "3 roam for 30s · 30 total resets",
    hotkey: "⇧3",
    radius: 0.8,
  },
  bloom: {
    name: "Heartwood Bloom",
    cost: 750,
    icon: "✿",
    color: "#f3a6df",
    tag: "Wide AoE · heal",
    description: "Hits 40 · execute wounded · heal 3",
    hotkey: "⇧4",
  },
};
const SPELL_ORDER = Object.keys(SPELL_DATA) as SpellKind[];
const BUFF_DATA: Record<BuffKind, {
  name: string;
  icon: string;
  family: string;
  description: string;
  color: string;
}> = {
  sunseed: {
    name: "Sunseed Lullaby",
    icon: "✦",
    family: "Chickadee mutation",
    description: "Chickadee hits gain a 20% chance to stun for 1 second.",
    color: "#e7d45d",
  },
  threeSeed: {
    name: "Three-Seed Salute",
    icon: "⁂",
    family: "Chickadee mutation",
    description: "18% of Chickadee attacks strike three times.",
    color: "#c8e85e",
  },
  shatterfrost: {
    name: "Shatterfrost",
    icon: "❉",
    family: "Foxglove mutation",
    description: "Foxglove attacks splash 70% damage and slow nearby Blightlings.",
    color: "#79dcf4",
  },
  longWinter: {
    name: "The Long Winter",
    icon: "❄",
    family: "Foxglove mutation",
    description: "Foxglove slows become much stronger and last 1.5 seconds longer.",
    color: "#a6eaff",
  },
  faultline: {
    name: "Faultline Pollen",
    icon: "◆",
    family: "Boarstone mutation",
    description: "Boarstone impact radius grows by 0.75 tiles.",
    color: "#eca55e",
  },
  aftershock: {
    name: "Aftershock Acorns",
    icon: "✹",
    family: "Boarstone mutation",
    description: "Boarstone impacts deal 40% more damage.",
    color: "#d9864f",
  },
  echoHowl: {
    name: "Echo Howl",
    icon: "◒",
    family: "Wolfwood mutation",
    description: "Wolfwood has a 25% chance to cast its full chain twice.",
    color: "#f4da5d",
  },
  packCircuit: {
    name: "Pack Circuit",
    icon: "ϟ",
    family: "Wolfwood mutation",
    description: "Wolfwood lightning gains two extra chain targets.",
    color: "#ffd96b",
  },
  ancientSap: {
    name: "Ancient Sap",
    icon: "⬙",
    family: "Grove blessing",
    description: "All guardians deal 22% more damage.",
    color: "#9fd36b",
  },
  tailwind: {
    name: "Tailwind Chorus",
    icon: "≈",
    family: "Grove blessing",
    description: "All guardians attack 15% faster.",
    color: "#b8e6c0",
  },
  longRoots: {
    name: "Long-Reaching Roots",
    icon: "⌁",
    family: "Grove blessing",
    description: "All guardians gain 0.45 tiles of range.",
    color: "#79c982",
  },
  gildedPollen: {
    name: "Gilded Pollen",
    icon: "✺",
    family: "Grove blessing",
    description: "Every Blightling bounty is worth 30% more gold.",
    color: "#f1bd54",
  },
  sunCrowned: {
    name: "Sun-Crowned",
    icon: "☀",
    family: "Solar Flare mutation",
    description: "Solar Flare scorches 6 more targets and stuns 10 more.",
    color: "#ffd35a",
  },
  deepFreeze: {
    name: "Deep Freeze",
    icon: "❄",
    family: "Ice Storm mutation",
    description: "Each Ice Storm wave hits 2 more targets and deals 1.25% more max-health damage.",
    color: "#8ee8ff",
  },
  stormShepherd: {
    name: "Storm Shepherd",
    icon: "◉",
    family: "Wild Tornado mutation",
    description: "Wild Tornadoes gains another twister and 3 resets per twister.",
    color: "#d8f5c0",
  },
  verdantMercy: {
    name: "Verdant Mercy",
    icon: "✿",
    family: "Heartwood Bloom mutation",
    description: "Heartwood Bloom hits 10 more, heals 2 more, and executes 5% sooner.",
    color: "#f3a6df",
  },
};
const BUFF_ORDER = Object.keys(BUFF_DATA) as BuffKind[];
function buffFamilyLabel(kind: BuffKind) {
  return BUFF_DATA[kind].family.replace(/\s+(mutation|blessing)$/i, "");
}
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const INTRO_STORAGE_KEY = "nature-defense-intro-v1";
const INTRO_STEPS = [
  {
    id: "story",
    label: "The story",
    title: "Nature makes its last stand",
    body: "The Blight is stampeding toward the Heartwood. Shape a living maze and let your animal guardians cleanse every creature before it reaches the grove.",
  },
  {
    id: "board",
    label: "The board",
    title: "Bend the shortest path",
    body: "Guardians occupy grass tiles and force Blightlings to reroute in four directions. You may twist the route, but the game will reject any build that seals it completely.",
  },
  {
    id: "health",
    label: "Heartwood health",
    title: "Protect all 20 life",
    body: "The top bar tracks gold, Heartwood health, wave, kills, and cleansing damage. Creatures that reach the Heartwood drain life; lose it all and the run ends.",
  },
  {
    id: "guardians",
    label: "Your towers",
    title: "Plant a guardian maze",
    body: "Press 1–4 to choose a guardian, hover to preview its range, then click grass to plant it. Each guardian costs gold and brings a different attack style.",
  },
  {
    id: "actions",
    label: "Live controls",
    title: "Build while the Blight moves",
    body: "A wave arrives every 30 seconds. Space calls it early for bonus gold. Select a guardian and press U to upgrade it; press S to sell it for a 75% refund.",
  },
] as const;
const keyOf = (x: number, y: number) => `${x},${y}`;
const formatNumber = (value: number) => NUMBER_FORMATTER.format(Math.round(value));

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

function calculateDistances(towers: Map<string, Tower>) {
  const distances = Array.from({ length: ROWS }, () =>
    Array<number>(COLS).fill(Infinity),
  );
  const queue: Point[] = [CITY];
  distances[CITY.y][CITY.x] = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const point = queue[head];
    const distance = distances[point.y][point.x] + 1;
    for (const next of [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    ]) {
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= COLS ||
        next.y >= ROWS ||
        towers.has(keyOf(next.x, next.y)) ||
        distances[next.y][next.x] !== Infinity
      ) {
        continue;
      }
      distances[next.y][next.x] = distance;
      queue.push(next);
    }
  }
  return distances;
}

function createPath(
  towers: Map<string, Tower>,
  random: () => number,
  randomize = true,
  origin = START,
) {
  const distances = calculateDistances(towers);
  if (!Number.isFinite(distances[origin.y][origin.x])) return null;
  const path = [origin];
  let current = origin;
  while (current.x !== CITY.x || current.y !== CITY.y) {
    const targetDistance = distances[current.y][current.x] - 1;
    const choices = [
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
      { x: current.x - 1, y: current.y },
    ].filter(
      (point) =>
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < COLS &&
        point.y < ROWS &&
        distances[point.y][point.x] === targetDistance,
    );
    if (!choices.length) return null;
    const choice = randomize
      ? choices[Math.floor(random() * choices.length)]
      : choices[0];
    path.push(choice);
    current = choice;
  }
  return path;
}

function createGame(seed = newSeed()): Game {
  const rng = mulberry32(seed);
  const towers = new Map<string, Tower>();
  return {
    gold: 500,
    health: MAX_HEALTH,
    wave: 0,
    phase: "intermission",
    towers,
    enemies: [],
    projectiles: [],
    waveQueue: [],
    spawnClock: 0,
    spawnInterval: 0.52,
    seed,
    rng,
    elapsed: 0,
    paused: false,
    speed: 1,
    kills: 0,
    damage: 0,
    realElapsed: 0,
    goldEarned: 0,
    goldSpent: 0,
    rushGold: 0,
    timeSaved: 0,
    wavesRushed: 0,
    rushStreak: 0,
    lastRushAt: -Infinity,
    towersBuilt: 0,
    towerUpgrades: 0,
    bestWave: 0,
    message: "Grow a guardian maze before the Blight arrives.",
    messageUntil: 5,
    route: createPath(towers, rng, false) ?? [],
    nextWaveIn: 30,
    wavePeriod: 30,
    waveAnnouncement: null,
    spellCharges: { solar: 0, ice: 0, tornado: 0, bloom: 0 },
    spellCasts: { solar: 0, ice: 0, tornado: 0, bloom: 0 },
    spellEffects: [],
    spellsCast: 0,
    buffs: [],
    pendingBuffChoices: null,
    bossesDefeated: 0,
  };
}

function savedTowers(game: Game): SavedTower[] {
  return [...game.towers.entries()].map(([key, tower]) => {
    const [x, y] = key.split(",").map(Number);
    return {
      x,
      y,
      kind: tower.kind,
      level: tower.level,
      kills: tower.kills,
      damageDone: tower.damageDone,
      spent: tower.spent,
    };
  });
}

function runStats(game: Game): RunStats {
  return {
    kills: game.kills,
    damage: game.damage,
    goldEarned: game.goldEarned,
    goldSpent: game.goldSpent,
    towersBuilt: game.towersBuilt,
    towerUpgrades: game.towerUpgrades,
    bossesDefeated: game.bossesDefeated,
    battleTime: game.realElapsed,
    spellsCast: game.spellsCast,
    wavesRushed: game.wavesRushed,
    rushGold: game.rushGold,
    timeSaved: game.timeSaved,
  };
}

function serializeGame(game: Game): GameSaveState {
  return {
    version: 1,
    seed: game.seed,
    wave: game.wave,
    gold: game.gold,
    health: game.health,
    bestWave: game.bestWave,
    towers: savedTowers(game),
    buffs: [...game.buffs],
    spellCharges: { ...game.spellCharges },
    spellCasts: { ...game.spellCasts },
    stats: runStats(game),
  };
}

/**
 * Rebuilds a run from a between-waves snapshot. The restored run always starts
 * in an intermission so the player gets their build window back.
 */
function restoreGame(save: GameSaveState): Game {
  const game = createGame(save.seed);
  game.wave = save.wave;
  game.gold = save.gold;
  game.health = save.health;
  game.bestWave = Math.max(save.bestWave, save.wave);
  game.buffs = [...save.buffs];
  game.spellCharges = { ...game.spellCharges, ...save.spellCharges };
  game.spellCasts = { ...game.spellCasts, ...save.spellCasts };
  game.kills = save.stats.kills;
  game.damage = save.stats.damage;
  game.goldEarned = save.stats.goldEarned;
  game.goldSpent = save.stats.goldSpent;
  game.towersBuilt = save.stats.towersBuilt;
  game.towerUpgrades = save.stats.towerUpgrades;
  game.bossesDefeated = save.stats.bossesDefeated;
  game.realElapsed = save.stats.battleTime;
  game.spellsCast = save.stats.spellsCast;
  game.wavesRushed = save.stats.wavesRushed;
  game.rushGold = save.stats.rushGold;
  game.timeSaved = save.stats.timeSaved;

  for (const tower of save.towers) {
    game.towers.set(keyOf(tower.x, tower.y), {
      kind: tower.kind,
      level: tower.level,
      spent: tower.spent ?? TOWER_DATA[tower.kind].cost,
      cooldown: 0,
      damageDone: tower.damageDone,
      kills: tower.kills,
    });
  }

  game.route = createPath(game.towers, game.rng, false) ?? [];
  game.message = `Run restored at wave ${save.wave}. Rebuild before the next Blight.`;
  game.messageUntil = 6;
  return game;
}

const MAX_TOWER_LEVEL = 5;
const UPGRADE_COST_MULTIPLIERS = [0, 2, 3, 5, 8];

function upgradeCost(tower: Tower) {
  if (tower.level >= MAX_TOWER_LEVEL) return null;
  return Math.round(
    TOWER_DATA[tower.kind].cost * UPGRADE_COST_MULTIPLIERS[tower.level],
  );
}

function buffRank(game: Game, kind: BuffKind) {
  return game.buffs.filter((buff) => buff === kind).length;
}

function spellCost(game: Game, kind: SpellKind) {
  const multiplier = Math.min(3, Math.pow(1.16, game.spellCasts[kind]));
  return Math.round(SPELL_DATA[kind].cost * multiplier);
}

function spellTargets(
  game: Game,
  predicate: (enemy: Enemy) => boolean,
  limit: number,
) {
  return game.enemies
    .filter((enemy) => !enemy.dead && predicate(enemy))
    .sort(
      (a, b) =>
        distance({ x: a.x, y: a.y }, CITY) -
        distance({ x: b.x, y: b.y }, CITY),
    )
    .slice(0, limit);
}

function offerBuffChoices(game: Game) {
  const unseen = BUFF_ORDER.filter((kind) => buffRank(game, kind) === 0);
  const seen = BUFF_ORDER.filter((kind) => buffRank(game, kind) > 0);
  for (let index = unseen.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(game.rng() * (index + 1));
    [unseen[index], unseen[swap]] = [unseen[swap], unseen[index]];
  }
  for (let index = seen.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(game.rng() * (index + 1));
    [seen[index], seen[swap]] = [seen[swap], seen[index]];
  }
  const pool = unseen.length ? [...unseen, ...seen] : seen;
  game.pendingBuffChoices = pool.slice(0, 3);
  game.paused = true;
  game.bossesDefeated += 1;
}

function towerStats(tower: Tower, game: Game) {
  const base = TOWER_DATA[tower.kind];
  const steps = tower.level - 1;
  return {
    damage:
      base.damage *
      (1 + steps * 0.75) *
      (1 + buffRank(game, "ancientSap") * 0.22),
    rate:
      base.rate *
      (1 + steps * 0.12) *
      (1 + buffRank(game, "tailwind") * 0.15),
    range: base.range + buffRank(game, "longRoots") * 0.45,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeWave(game: Game) {
  const wave = game.wave;
  if (wave % 5 === 0) return [BOSS];
  const available = BLIGHTLINGS.filter((invader) => invader.unlock <= wave);
  const count = 8 + wave * 2;
  const queue: Invader[] = [];
  const roster = [...available].sort(() => game.rng() - 0.5);
  for (let i = 0; i < count; i += 1) {
    const mixedIndex = (i + Math.floor(game.rng() * roster.length)) % roster.length;
    queue.push(roster[mixedIndex]);
  }
  return queue;
}

function queueNextWave(
  game: Game,
  earlyBonus = 0,
  rushStreak = 0,
  rushMultiplier = 1,
) {
  game.wave += 1;
  const levelBonus = 35 + game.wave * 5;
  const bossWave = game.wave % 5 === 0;
  const wave = makeWave(game);
  const counts = new Map<string, { invader: Invader; count: number }>();
  for (const invader of wave) {
    const existing = counts.get(invader.name);
    if (existing) existing.count += 1;
    else counts.set(invader.name, { invader, count: 1 });
  }
  game.waveQueue.push(...wave);
  game.spawnInterval = Math.max(0.2, 0.5 - game.wave * 0.007);
  game.spawnClock = Math.min(game.spawnClock, 0);
  game.nextWaveIn = game.wavePeriod;
  game.phase = "wave";
  game.paused = false;
  game.gold += earlyBonus + levelBonus;
  game.rushGold += earlyBonus;
  game.goldEarned += earlyBonus + levelBonus;
  game.message = bossWave
    ? `Boss wave ${formatNumber(game.wave)} — The Grime King carries a ${formatNumber(BOSS.bounty)} gold bounty!`
    : earlyBonus
      ? `Wave ${formatNumber(game.wave)} rushed — +${formatNumber(earlyBonus)} rush gold and +${formatNumber(levelBonus)} level gold!`
      : `Wave ${formatNumber(game.wave)} — +${formatNumber(levelBonus)} level gold.`;
  game.messageUntil = game.elapsed + 4;
  game.waveAnnouncement = {
    wave: game.wave,
    total: wave.length,
    levelBonus,
    bossWave,
    roster: [...counts.values()],
    earlyBonus,
    rushStreak,
    rushMultiplier,
    expiresAt: Date.now() + 2600,
  };
}

function rerouteEnemies(game: Game) {
  for (const enemy of game.enemies) {
    const origin = {
      x: Math.max(0, Math.min(COLS - 1, Math.floor(enemy.x))),
      y: Math.max(0, Math.min(ROWS - 1, Math.floor(enemy.y))),
    };
    const path = createPath(game.towers, game.rng, true, origin);
    if (path) {
      enemy.path = path;
      enemy.pathIndex = 0;
    }
  }
}

function upcomingInvaders(wave: number) {
  const next = wave + 1;
  if (next % 5 === 0) return [BOSS];
  return BLIGHTLINGS.filter((invader) => invader.unlock <= next).slice(0, 5);
}

/** Runs `paint` with the origin at the centre of a grid cell, scaled to it. */
function drawInCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  paint: () => void,
) {
  context.save();
  context.translate((x + 0.5) * CELL, (y + 0.5) * CELL);
  context.scale(CELL / 100, CELL / 100);
  paint();
  context.restore();
}

/** How high above cell centre each guardian sits — tuned per nest silhouette. */
const GUARDIAN_PERCH: Record<TowerKind, number> = {
  thorn: 2,
  frost: -14,
  boulder: -20,
  lightning: -22,
};

/**
 * Nest plus its guardian, in the shared 100-box. Both the board and the UI
 * icons go through here so a tower looks identical wherever it appears.
 */
function paintTower(
  context: CanvasRenderingContext2D,
  kind: TowerKind,
  elapsed: number,
  phase: number,
  level = 1,
) {
  // Slightly over 1 so a nest fills its cell and reads as built there, rather
  // than as a small object dropped on the grass. Rank adds a little heft on top
  // of the gear — kept small deliberately, since a guardian already reaches the
  // cell edge at rank 1 and more growth spills onto vertical neighbours.
  const bulk = 1.16 + (level - 1) * 0.02;
  context.scale(bulk, bulk);
  context.save();
  context.translate(0, 4);
  drawNest(context, kind, elapsed, phase, level);
  context.restore();
  // The guardian perches on the nest rim, overlapping it so the two read as
  // one object rather than a sprite floating over scenery.
  context.translate(4, GUARDIAN_PERCH[kind]);
  context.scale(0.58, 0.58);
  drawGuardian(context, kind, elapsed, phase, level);
}

function drawTowerAt(
  context: CanvasRenderingContext2D,
  kind: TowerKind,
  x: number,
  y: number,
  elapsed: number,
  phase: number,
  alpha: number,
  level = 1,
) {
  context.save();
  context.globalAlpha = alpha;
  drawInCell(context, x, y, () => paintTower(context, kind, elapsed, phase, level));
  context.restore();
}

/**
 * Small standalone canvas that paints one of the vector sprites for the UI.
 * `animate` off paints a single frame — the leaderboard mini-board shows up to
 * 200 cells at once and doesn't need a loop per tower.
 */
function ArtIcon({
  paint,
  size = 34,
  label,
  animate = true,
}: {
  paint: (context: CanvasRenderingContext2D, elapsed: number) => void;
  size?: number;
  label?: string;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    let frame = 0;
    const render = (time: number) => {
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const box = width / 100;
      context.setTransform(box, 0, 0, box, width / 2, height / 2);
      context.clearRect(-50, -50, 100, 100);
      paintRef.current(context, time / 1000);
      if (animate) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return (
    <canvas
      ref={ref}
      className="art-icon"
      style={{ width: size, height: size }}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

function BlightIcon({ invader, size }: { invader: Invader; size?: number }) {
  return (
    <ArtIcon
      size={size}
      label={invader.name}
      paint={(context, elapsed) =>
        drawBlightling(context, invader.art, elapsed, invader.unlock * 1.3, 1)
      }
    />
  );
}

function TowerIcon({
  kind,
  size,
  animate,
  level = 1,
}: {
  kind: TowerKind;
  size?: number;
  animate?: boolean;
  level?: number;
}) {
  return (
    <ArtIcon
      size={size}
      animate={animate}
      paint={(context, elapsed) => paintTower(context, kind, elapsed, 0, level)}
    />
  );
}

function RunDetails({ run }: { run: LeaderboardRun }) {
  const towers = new Map(run.towers.map((tower) => [keyOf(tower.x, tower.y), tower]));
  const buffRanks = new Map<BuffKind, number>();
  for (const buff of run.buffs) {
    buffRanks.set(buff, (buffRanks.get(buff) ?? 0) + 1);
  }

  return (
    <article className="run-details">
      <header>
        <div>
          <span>Wave {formatNumber(run.wave)}</span>
          <h3>{run.name}&apos;s build</h3>
        </div>
        <small>
          {new Date(run.playedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })} · seed {run.seed}
        </small>
      </header>
      <div className="saved-board" aria-label="Final guardian board layout">
        {Array.from({ length: ROWS * COLS }, (_, index) => {
          const x = index % COLS;
          const y = Math.floor(index / COLS);
          const tower = towers.get(keyOf(x, y));
          const endpoint =
            x === START.x && y === START.y
              ? "rift"
              : x === CITY.x && y === CITY.y
                ? "heartwood"
                : "";
          return (
            <div
              key={index}
              className={`saved-board-cell ${tower ? "tower" : ""} ${endpoint}`}
              title={
                tower
                  ? `${TOWER_DATA[tower.kind].name}, level ${tower.level}, ${formatNumber(tower.kills)} cleared`
                  : endpoint || undefined
              }
              style={
                tower
                  ? { "--tower-color": TOWER_DATA[tower.kind].color } as React.CSSProperties
                  : undefined
              }
            >
              {tower ? (
                <>
                  <TowerIcon
                    kind={tower.kind}
                    size={22}
                    animate={false}
                    level={tower.level}
                  />
                  <b>{tower.level}</b>
                </>
              ) : endpoint === "rift" ? "✦" : endpoint === "heartwood" ? "♥" : null}
            </div>
          );
        })}
      </div>
      <div className="saved-build-section">
        <strong>Rogue cards</strong>
        {buffRanks.size ? (
          <div className="saved-buffs">
            {[...buffRanks].map(([kind, rank]) => (
              <div
                key={kind}
                className="saved-buff-card"
                style={{ "--buff-color": BUFF_DATA[kind].color } as React.CSSProperties}
              >
                <header>
                  <b>{BUFF_DATA[kind].icon}</b>
                  <div>
                    <strong>
                      {BUFF_DATA[kind].name}
                      {rank > 1 ? ` ×${rank}` : ""}
                    </strong>
                    <small>{buffFamilyLabel(kind)}</small>
                  </div>
                </header>
                <p>{BUFF_DATA[kind].description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No blessings collected.</p>
        )}
      </div>
      <div className="saved-run-stats">
        <span><small>Cleared</small><strong>{formatNumber(run.stats.kills)}</strong></span>
        <span><small>Damage</small><strong>{formatNumber(run.stats.damage)}</strong></span>
        <span><small>Battle time</small><strong>{formatDuration(run.stats.battleTime)}</strong></span>
        <span><small>Gold earned</small><strong>{formatNumber(run.stats.goldEarned)}</strong></span>
        <span><small>Gold spent</small><strong>{formatNumber(run.stats.goldSpent)}</strong></span>
        <span><small>Guardians</small><strong>{formatNumber(run.stats.towersBuilt)}</strong></span>
        <span><small>Upgrades</small><strong>{formatNumber(run.stats.towerUpgrades)}</strong></span>
        <span><small>Bosses</small><strong>{formatNumber(run.stats.bossesDefeated)}</strong></span>
        <span><small>Spells</small><strong>{formatNumber(run.stats.spellsCast)}</strong></span>
        <span><small>Waves rushed</small><strong>{formatNumber(run.stats.wavesRushed)}</strong></span>
        <span><small>Rush gold</small><strong>{formatNumber(run.stats.rushGold)}</strong></span>
        <span><small>Time saved</small><strong>{formatDuration(run.stats.timeSaved)}</strong></span>
      </div>
    </article>
  );
}

function CurrentRunOverview({ game }: { game: Game }) {
  const towerBreakdown = TOWER_ORDER.map((kind) => {
    const towers = [...game.towers.values()].filter((tower) => tower.kind === kind);
    return {
      kind,
      count: towers.length,
      levels: towers.reduce((total, tower) => total + tower.level, 0),
      kills: towers.reduce((total, tower) => total + tower.kills, 0),
      damage: towers.reduce((total, tower) => total + tower.damageDone, 0),
      invested: towers.reduce((total, tower) => total + tower.spent, 0),
    };
  }).filter(({ count }) => count > 0);
  const activeBuffs = BUFF_ORDER.filter((kind) => buffRank(game, kind) > 0);

  return (
    <section className="run-overview" role="dialog" aria-modal="true" aria-labelledby="run-overview-title">
      <header className="run-overview-header">
        <div>
          <p className="eyebrow">Current stand</p>
          <h2 id="run-overview-title">Wave {formatNumber(game.wave)} overview</h2>
        </div>
        <span><kbd>Tab</kbd> release to close</span>
      </header>

      <div className="run-overview-vitals">
        <span><small>Heartwood</small><strong>{game.health}/{MAX_HEALTH}</strong></span>
        <span><small>Gold ready</small><strong>{formatNumber(game.gold)}</strong></span>
        <span><small>Best wave</small><strong>{formatNumber(game.bestWave)}</strong></span>
        <span><small>Battle time</small><strong>{formatDuration(game.realElapsed)}</strong></span>
      </div>

      <div className="run-overview-layout">
        <div className="run-overview-column">
          <h3>Guardian build <small>{game.towers.size} active</small></h3>
          {towerBreakdown.length ? (
            <div className="overview-guardians">
              {towerBreakdown.map(({ kind, count, levels, kills, damage, invested }) => (
                <article key={kind} style={{ "--tower-color": TOWER_DATA[kind].color } as React.CSSProperties}>
                  <TowerIcon kind={kind} size={48} level={Math.max(1, Math.round(levels / count))} />
                  <div>
                    <strong>{TOWER_DATA[kind].name}</strong>
                    <span>{count} active · {levels} total levels · {formatNumber(invested)} gold</span>
                  </div>
                  <dl>
                    <div><dt>Cleared</dt><dd>{formatNumber(kills)}</dd></div>
                    <div><dt>Damage</dt><dd>{formatNumber(damage)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          ) : <p className="overview-empty">No guardians planted yet.</p>}

          <h3>Grove blessings <small>{activeBuffs.length} unique</small></h3>
          {activeBuffs.length ? (
            <div className="overview-buffs">
              {activeBuffs.map((kind) => (
                <span key={kind} style={{ "--buff-color": BUFF_DATA[kind].color } as React.CSSProperties} title={BUFF_DATA[kind].description}>
                  <b>{BUFF_DATA[kind].icon}</b>
                  {BUFF_DATA[kind].name}
                  {buffRank(game, kind) > 1 ? <small>×{buffRank(game, kind)}</small> : null}
                </span>
              ))}
            </div>
          ) : <p className="overview-empty">Defeat a Grime King to earn your first blessing.</p>}
        </div>

        <div className="run-overview-column">
          <h3>Run totals</h3>
          <div className="overview-stat-grid">
            <span><small>Blightlings cleared</small><strong>{formatNumber(game.kills)}</strong></span>
            <span><small>Cleansing damage</small><strong>{formatNumber(game.damage)}</strong></span>
            <span><small>Gold earned</small><strong>{formatNumber(game.goldEarned)}</strong></span>
            <span><small>Gold invested</small><strong>{formatNumber(game.goldSpent)}</strong></span>
            <span><small>Guardians planted</small><strong>{formatNumber(game.towersBuilt)}</strong></span>
            <span><small>Guardian upgrades</small><strong>{formatNumber(game.towerUpgrades)}</strong></span>
            <span><small>Bosses defeated</small><strong>{formatNumber(game.bossesDefeated)}</strong></span>
            <span><small>Spells unleashed</small><strong>{formatNumber(game.spellsCast)}</strong></span>
            <span><small>Waves rushed</small><strong>{formatNumber(game.wavesRushed)}</strong></span>
            <span><small>Rush gold</small><strong>{formatNumber(game.rushGold)}</strong></span>
            <span><small>Time saved</small><strong>{formatDuration(game.timeSaved)}</strong></span>
            <span><small>Rush streak</small><strong>×{formatNumber(game.rushStreak)}</strong></span>
          </div>

          <h3>Wild magic</h3>
          <div className="overview-spells">
            {SPELL_ORDER.map((kind) => (
              <span key={kind}>
                <b>{SPELL_DATA[kind].icon}</b>
                <span>{SPELL_DATA[kind].name}<small>{game.spellCasts[kind]} cast</small></span>
                <strong>{game.spellCharges[kind]} ready</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type GameProps = {
  displayName: string;
  isNewProfile: boolean;
  email: string;
  savedGame: GameSaveState | null;
  initialLeaderboard: LeaderboardRun[];
  bestWave: number;
  lastSeenReleaseId: string | null;
};

export default function NatureDefenseGame({
  displayName: initialDisplayName,
  isNewProfile,
  email,
  savedGame,
  initialLeaderboard,
  bestWave,
  lastSeenReleaseId,
}: GameProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);
  const guardianDockRef = useRef<HTMLDivElement>(null);
  const hudActionsRef = useRef<HTMLDivElement>(null);
  // Built on the first render only, so restoring a save never re-runs pathfinding.
  const gameRef = useRef<Game>(null as unknown as Game);
  if (!gameRef.current) {
    const initial = savedGame ? restoreGame(savedGame) : createGame();
    if (!isNewProfile && lastSeenReleaseId !== CURRENT_RELEASE.version) {
      initial.paused = true;
    }
    initial.bestWave = Math.max(bestWave, initial.bestWave);
    gameRef.current = initial;
  }
  const renderScaleRef = useRef(1);
  const hoverRef = useRef<Point | null>(null);
  const selectedKindRef = useRef<TowerKind>("thorn");
  const buildingRef = useRef(true);
  const selectedSpellRef = useRef<SpellKind | null>(null);
  const selectedCellRef = useRef<Point | null>(null);
  const helpPausedRef = useRef(false);
  const introPausedRef = useRef(false);
  const releasePausedRef = useRef(false);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [, setRevision] = useState(0);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("thorn");
  const [isBuilding, setIsBuilding] = useState(true);
  const [selectedSpell, setSelectedSpell] = useState<SpellKind | null>(null);
  const [selectedCell, setSelectedCell] = useState<Point | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(
    !isNewProfile && lastSeenReleaseId !== CURRENT_RELEASE.version,
  );
  const [releasePreview, setReleasePreview] = useState(false);
  const [releaseDismissError, setReleaseDismissError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(isNewProfile);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameDraft, setNameDraft] = useState(initialDisplayName);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [profilePending, startProfileTransition] = useTransition();
  const [groveBuildOpen, setGroveBuildOpen] = useState(false);
  const [runOverviewOpen, setRunOverviewOpen] = useState(false);
  const [leaderboard, setLeaderboard] =
    useState<LeaderboardRun[]>(initialLeaderboard);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runSubmitted, setRunSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [introStep, setIntroStep] = useState(0);
  const [introHighlight, setIntroHighlight] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  } | null>(null);

  const refresh = useCallback(() => setRevision((revision) => revision + 1), []);

  const notify = useCallback((message: string) => {
    const game = gameRef.current;
    game.message = message;
    game.messageUntil = game.elapsed + 3.2;
    refresh();
  }, [refresh]);

  const openWhatsNew = useCallback(() => {
    releasePausedRef.current = gameRef.current.paused;
    gameRef.current.paused = true;
    setReleasePreview(false);
    setWhatsNewOpen(true);
    refresh();
  }, [refresh]);

  const dismissWhatsNew = useCallback(() => {
    setWhatsNewOpen(false);
    gameRef.current.paused = releasePausedRef.current;
    if (!releasePreview) {
      void markReleaseSeen(CURRENT_RELEASE.version).then((result) => {
        if (!result.ok) setReleaseDismissError(result.error);
      });
    }
    setReleasePreview(false);
    refresh();
  }, [refresh, releasePreview]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("release-preview") !== "1") return;
    releasePausedRef.current = gameRef.current.paused;
    gameRef.current.paused = true;
    setReleasePreview(true);
    setWhatsNewOpen(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    selectedKindRef.current = selectedKind;
  }, [selectedKind]);

  useEffect(() => {
    selectedSpellRef.current = selectedSpell;
  }, [selectedSpell]);

  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  // The board is vector-drawn, so the backing store has to match the real
  // display pixels or everything blurs — CSS stretches the canvas to fit.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      renderScaleRef.current = width / WIDTH;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const syncBest = useCallback((wave: number) => {
    const game = gameRef.current;
    game.bestWave = Math.max(game.bestWave, wave);
  }, []);

  const lastSavedRef = useRef<string | null>(
    savedGame ? JSON.stringify(savedGame) : null,
  );
  const savingRef = useRef(false);
  const submittingRef = useRef(false);

  const persistGame = useCallback(async () => {
    const game = gameRef.current;
    if (savingRef.current || game.phase === "gameover") return;
    const snapshot = serializeGame(game);
    const payload = JSON.stringify(snapshot);
    if (payload === lastSavedRef.current) return;

    savingRef.current = true;
    const result = await saveGameState(snapshot);
    savingRef.current = false;
    if (result.ok) {
      lastSavedRef.current = payload;
      setSaveError("");
    } else {
      setSaveError(result.error);
    }
  }, []);

  // Autosave between waves; live wave state is deliberately not checkpointed.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (gameRef.current.phase === "intermission") void persistGame();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [persistGame]);

  const publishRun = useCallback(async () => {
    const game = gameRef.current;
    if (submittingRef.current || runSubmitted) return;
    submittingRef.current = true;
    const result = await submitRun({
      wave: game.wave,
      seed: game.seed,
      towers: savedTowers(game),
      buffs: [...game.buffs],
      stats: runStats(game),
    });
    submittingRef.current = false;
    if (result.ok) {
      lastSavedRef.current = null;
      setLeaderboard(result.leaderboard);
      setRunSubmitted(true);
      setSaveError("");
    } else {
      setSaveError(result.error);
    }
  }, [runSubmitted]);

  const openLeaderboard = useCallback(() => {
    setLeaderboardOpen(true);
    void fetchLeaderboard().then(setLeaderboard);
  }, []);

  const gamePhase = gameRef.current.phase;

  // A wilted run posts itself to the leaderboard under the profile name.
  useEffect(() => {
    if (gamePhase === "gameover") void publishRun();
  }, [gamePhase, publishRun]);

  const damageEnemy = useCallback(
    (game: Game, enemy: Enemy, damageAmount: number, tower: Tower) => {
      if (enemy.dead) return;
      const applied = Math.min(enemy.hp, damageAmount);
      enemy.hp -= damageAmount;
      tower.damageDone += applied;
      game.damage += applied;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        tower.kills += 1;
        game.kills += 1;
        const bounty = Math.round(
          enemy.bounty * (1 + buffRank(game, "gildedPollen") * 0.3),
        );
        game.gold += bounty;
        game.goldEarned += bounty;
        if (enemy.invader === BOSS && !game.pendingBuffChoices) {
          offerBuffChoices(game);
        }
      }
    },
    [],
  );

  const damageEnemyWithSpell = useCallback(
    (game: Game, enemy: Enemy, damageAmount: number) => {
      if (enemy.dead) return;
      const applied = Math.min(enemy.hp, damageAmount);
      enemy.hp -= damageAmount;
      game.damage += applied;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        game.kills += 1;
        const bounty = Math.round(
          enemy.bounty * (1 + buffRank(game, "gildedPollen") * 0.3),
        );
        game.gold += bounty;
        game.goldEarned += bounty;
        if (enemy.invader === BOSS && !game.pendingBuffChoices) {
          offerBuffChoices(game);
        }
      }
    },
    [],
  );

  const fireTower = useCallback(
    (game: Game, gridPoint: Point, tower: Tower) => {
      const stats = towerStats(tower, game);
      const from = { x: gridPoint.x + 0.5, y: gridPoint.y + 0.5 };
      const candidates = game.enemies
        .filter(
          (enemy) =>
            !enemy.dead &&
            distance(from, { x: enemy.x, y: enemy.y }) <= stats.range,
        )
        .sort((a, b) => {
          const aRemaining = a.path.length - a.pathIndex;
          const bRemaining = b.path.length - b.pathIndex;
          return aRemaining - bRemaining;
        });
      const target = candidates[0];
      if (!target) return false;

      const targetPoint = { x: target.x, y: target.y };
      if (tower.kind === "boulder") {
        const radius =
          1.18 +
          tower.level * 0.12 +
          buffRank(game, "faultline") * 0.75;
        const damage =
          stats.damage * (1 + buffRank(game, "aftershock") * 0.4);
        for (const enemy of game.enemies) {
          if (
            !enemy.dead &&
            distance(targetPoint, { x: enemy.x, y: enemy.y }) <= radius
          ) {
            damageEnemy(game, enemy, damage, tower);
          }
        }
        game.projectiles.push({
          from,
          to: targetPoint,
          kind: "boulder",
          age: 0,
          duration: 0.46,
          seed: game.rng(),
          arc: true,
        });
      } else if (tower.kind === "lightning") {
        const echoChance = Math.min(0.75, buffRank(game, "echoHowl") * 0.25);
        const casts = game.rng() < echoChance ? 2 : 1;
        for (let cast = 0; cast < casts; cast += 1) {
          const struck = new Set<number>();
          let current: Enemy | null = target.dead ? candidates.find((enemy) => !enemy.dead) ?? null : target;
          let chainFrom = from;
          const chains =
            1 + tower.level + buffRank(game, "packCircuit") * 2;
          for (let index = 0; index < chains && current; index += 1) {
            struck.add(current.id);
            const currentPoint = { x: current.x, y: current.y };
            damageEnemy(
              game,
              current,
              stats.damage * Math.pow(0.78, index),
              tower,
            );
            game.projectiles.push({
              from: chainFrom,
              to: currentPoint,
              kind: "lightning",
              age: 0,
              duration: 0.26,
              seed: game.rng(),
            });
            chainFrom = currentPoint;
            current =
              game.enemies
                .filter(
                  (enemy) =>
                    !enemy.dead &&
                    !struck.has(enemy.id) &&
                    distance(chainFrom, { x: enemy.x, y: enemy.y }) <=
                      1.45 + tower.level * 0.12,
                )
                .sort(
                  (a, b) =>
                    distance(chainFrom, { x: a.x, y: a.y }) -
                    distance(chainFrom, { x: b.x, y: b.y }),
                )[0] ?? null;
          }
        }
      } else if (tower.kind === "frost") {
        const splashRank = buffRank(game, "shatterfrost");
        const slowRank = buffRank(game, "longWinter");
        const victims = splashRank
          ? game.enemies.filter(
              (enemy) =>
                !enemy.dead &&
                distance(targetPoint, { x: enemy.x, y: enemy.y }) <=
                  1.05 + (splashRank - 1) * 0.15,
            )
          : [target];
        for (const enemy of victims) {
          damageEnemy(
            game,
            enemy,
            enemy === target
              ? stats.damage
              : stats.damage * Math.min(1, 0.7 + (splashRank - 1) * 0.1),
            tower,
          );
          enemy.slowFactor = Math.max(
            0.22,
            0.72 - tower.level * 0.08 - slowRank * 0.17,
          );
          enemy.slowUntil =
            game.elapsed + 1.35 + tower.level * 0.35 + slowRank * 1.5;
        }
        game.projectiles.push({
          from,
          to: targetPoint,
          kind: "frost",
          age: 0,
          duration: 0.36,
          seed: game.rng(),
        });
      } else {
        let hits = 1;
        const volleyChance = Math.min(0.72, buffRank(game, "threeSeed") * 0.18);
        if (game.rng() < volleyChance) hits = 3;
        for (let hit = 0; hit < hits; hit += 1) {
          damageEnemy(game, target, stats.damage, tower);
        }
        const stunChance = Math.min(0.8, buffRank(game, "sunseed") * 0.2);
        if (!target.dead && game.rng() < stunChance) {
          target.stunUntil = Math.max(target.stunUntil, game.elapsed + 1);
        }
        game.projectiles.push({
          from,
          to: targetPoint,
          kind: "thorn",
          age: 0,
          duration: 0.32,
          seed: game.rng(),
        });
      }
      return true;
    },
    [damageEnemy],
  );

  const spawnEnemy = useCallback((game: Game, invader: Invader) => {
    const path = createPath(game.towers, game.rng, true);
    if (!path) return;
    const waveScale = Math.pow(1.16, game.wave - 1);
    const maxHp = 55 * waveScale * invader.hp;
    game.enemies.push({
      id: Math.floor(game.rng() * 0x7fffffff),
      invader,
      path,
      pathIndex: 0,
      x: path[0].x + 0.5,
      y: path[0].y + 0.5,
      hp: maxHp,
      maxHp,
      speed: (1.76 + Math.min(game.wave, 40) * 0.013) * invader.speed,
      bounty: Math.max(1, Math.round(invader.bounty * (1 + game.wave * 0.025))),
      cityDamage: invader.cityDamage ?? 1,
      slowUntil: 0,
      slowFactor: 1,
      stunUntil: 0,
      blindUntil: 0,
      dead: false,
    });
  }, []);

  const updateGame = useCallback(
    (rawDelta: number) => {
      const game = gameRef.current;
      if (game.paused || game.phase === "gameover") return;
      const frameDelta = Math.min(rawDelta, 0.05);
      game.realElapsed += frameDelta;
      const delta = frameDelta * game.speed;
      game.elapsed += delta;
      game.nextWaveIn -= delta;
      if (game.nextWaveIn <= 0) {
        queueNextWave(game);
        syncBest(game.wave);
      }

      game.spawnClock -= delta;
      if (game.waveQueue.length && game.spawnClock <= 0) {
        const invader = game.waveQueue.shift();
        if (invader) spawnEnemy(game, invader);
        game.spawnClock = game.spawnInterval;
      }

      for (const effect of game.spellEffects) {
        if (effect.kind === "ice") {
          while (game.elapsed >= effect.nextTick && effect.nextTick <= effect.endsAt) {
            const deepFreezeRank = buffRank(game, "deepFreeze");
            const slowTargets = spellTargets(
              game,
              (enemy) =>
                distance(effect.center, { x: enemy.x, y: enemy.y }) <= 3.5,
              24 + deepFreezeRank * 3,
            );
            const damageTargetIds = new Set(
              slowTargets
                .slice(0, 14 + deepFreezeRank * 2)
                .map((enemy) => enemy.id),
            );
            for (const enemy of slowTargets) {
              if (damageTargetIds.has(enemy.id)) {
                damageEnemyWithSpell(
                  game,
                  enemy,
                  enemy.maxHp * (0.07 + Math.min(4, deepFreezeRank) * 0.0125),
                );
              }
              enemy.slowFactor = Math.min(enemy.slowFactor, 0.38);
              enemy.slowUntil = Math.max(enemy.slowUntil, game.elapsed + 1.35);
            }
            effect.nextTick += 1;
          }
        } else if (effect.kind === "tornado") {
          if (game.elapsed >= effect.turnAt) {
            effect.angle += (game.rng() - 0.5) * 2.4;
            effect.turnAt = game.elapsed + 0.65 + game.rng() * 1.15;
          }
          effect.x += Math.cos(effect.angle) * delta * 2.3;
          effect.y += Math.sin(effect.angle) * delta * 2.3;
          if (effect.x < 0.35 || effect.x > COLS - 0.35) {
            effect.angle = Math.PI - effect.angle;
            effect.x = Math.max(0.35, Math.min(COLS - 0.35, effect.x));
          }
          if (effect.y < 0.35 || effect.y > ROWS - 0.35) {
            effect.angle = -effect.angle;
            effect.y = Math.max(0.35, Math.min(ROWS - 0.35, effect.y));
          }
          for (const enemy of game.enemies) {
            if (
              !enemy.dead &&
              effect.resetsLeft > 0 &&
              distance({ x: effect.x, y: effect.y }, { x: enemy.x, y: enemy.y }) <= 0.82 &&
              game.elapsed - (effect.hits[enemy.id] ?? -Infinity) > 1.1
            ) {
              const path = createPath(game.towers, game.rng, true);
              if (path) {
                enemy.path = path;
                enemy.pathIndex = 0;
                enemy.x = START.x + 0.5;
                enemy.y = START.y + 0.5;
                effect.hits[enemy.id] = game.elapsed;
                effect.resetsLeft -= 1;
              }
            }
          }
        }
      }
      game.spellEffects = game.spellEffects.filter(
        (effect) => effect.endsAt > game.elapsed,
      );

      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        if (enemy.stunUntil > game.elapsed) continue;
        const next = enemy.path[enemy.pathIndex + 1];
        if (!next) {
          enemy.dead = true;
          game.health -= enemy.cityDamage;
          game.message = `${enemy.invader.name} drained the Heartwood!`;
          game.messageUntil = game.elapsed + 2;
          if (game.health <= 0) {
            game.health = 0;
            game.phase = "gameover";
            game.paused = false;
            syncBest(game.wave);
            refresh();
            break;
          }
          continue;
        }
        const speed =
          enemy.speed *
          (enemy.slowUntil > game.elapsed ? enemy.slowFactor : 1);
        const targetX = next.x + 0.5;
        const targetY = next.y + 0.5;
        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const remaining = Math.hypot(dx, dy);
        const movement = speed * delta;
        if (movement >= remaining) {
          enemy.x = targetX;
          enemy.y = targetY;
          enemy.pathIndex += 1;
        } else if (remaining > 0) {
          enemy.x += (dx / remaining) * movement;
          enemy.y += (dy / remaining) * movement;
        }
      }

      game.enemies = game.enemies.filter((enemy) => !enemy.dead);

      for (const [key, tower] of game.towers) {
        tower.cooldown -= delta;
        if (tower.cooldown > 0) continue;
        const [x, y] = key.split(",").map(Number);
        if (fireTower(game, { x, y }, tower)) {
          tower.cooldown = 1 / towerStats(tower, game).rate;
        }
      }

      for (const projectile of game.projectiles) projectile.age += delta;
      game.projectiles = game.projectiles.filter(
        (projectile) => projectile.age < projectile.duration,
      );

      if (
        game.phase === "wave" &&
        game.waveQueue.length === 0 &&
        game.enemies.length === 0
      ) {
        const clearBonus = 20 + game.wave * 2;
        game.gold += clearBonus;
        game.goldEarned += clearBonus;
        game.phase = "intermission";
        game.message = `Grove clear — +${formatNumber(clearBonus)} gold. Build before the next Blight.`;
        game.messageUntil = game.elapsed + 4;
      }
    },
    [damageEnemyWithSpell, fireTower, refresh, spawnEnemy, syncBest],
  );

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const game = gameRef.current;
    const scale = renderScaleRef.current;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);

    drawGrass(context, COLS, ROWS, CELL, game.elapsed);
    // Endpoints overflow their cell a little on purpose.
    drawInCell(context, START.x, START.y, () => {
      context.scale(1.2, 1.2);
      drawRift(context, game.elapsed);
    });
    drawInCell(context, CITY.x, CITY.y, () => {
      context.scale(1.28, 1.28);
      drawHeartwood(context, game.elapsed, Math.max(0, game.health / MAX_HEALTH));
    });

    for (const [key, tower] of game.towers) {
      const [x, y] = key.split(",").map(Number);
      const phase = x * 1.7 + y * 2.3;
      drawTowerAt(context, tower.kind, x, y, game.elapsed, phase, 1, tower.level);
      context.fillStyle = TOWER_DATA[tower.kind].color;
      context.strokeStyle = "rgba(255, 250, 240, .85)";
      context.lineWidth = 1;
      for (let level = 0; level < tower.level; level += 1) {
        context.beginPath();
        context.arc(x * CELL + 7 + level * 7, y * CELL + 35, 2.4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }

    const hover = hoverRef.current;
    if (hover && game.phase !== "gameover") {
      const armedSpell = selectedSpellRef.current;
      if (armedSpell) {
        const spell = SPELL_DATA[armedSpell];
        const centerX = (hover.x + 0.5) * CELL;
        const centerY = (hover.y + 0.5) * CELL;
        context.fillStyle = `${spell.color}30`;
        context.strokeStyle = spell.color;
        context.lineWidth = 2.5;
        context.setLineDash([9, 6]);
        if (armedSpell === "bloom") {
          context.fillRect(0, 0, WIDTH, HEIGHT);
          context.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6);
        } else {
          context.beginPath();
          context.arc(centerX, centerY, (spell.radius ?? 1) * CELL, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          if (armedSpell === "solar") {
            context.strokeStyle = "#fff4b0";
            context.setLineDash([4, 4]);
            context.beginPath();
            context.arc(centerX, centerY, 2.6 * CELL, 0, Math.PI * 2);
            context.stroke();
          }
        }
        context.setLineDash([]);
      } else if (buildingRef.current) {
        const occupied = game.towers.has(keyOf(hover.x, hover.y));
        const forbidden =
          (hover.x === START.x && hover.y === START.y) ||
          (hover.x === CITY.x && hover.y === CITY.y);
        const affordable = game.gold >= TOWER_DATA[selectedKindRef.current].cost;
        context.fillStyle =
          occupied || forbidden || !affordable
            ? "rgba(244, 87, 80, .35)"
            : "rgba(226, 245, 132, .27)";
        context.fillRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
        if (!occupied && !forbidden) {
          const selectedTower = TOWER_DATA[selectedKindRef.current];
          context.strokeStyle = selectedTower.color;
          context.setLineDash([7, 5]);
          context.lineWidth = 2;
          context.beginPath();
          context.arc(
            (hover.x + 0.5) * CELL,
            (hover.y + 0.5) * CELL,
            selectedTower.range * CELL,
            0,
            Math.PI * 2,
          );
          context.stroke();
          context.setLineDash([]);
          drawTowerAt(
            context,
            selectedKindRef.current,
            hover.x,
            hover.y,
            game.elapsed,
            0,
            0.62,
          );
        }
      }
    }

    const selected = selectedCellRef.current;
    if (selected && game.towers.has(keyOf(selected.x, selected.y))) {
      const tower = game.towers.get(keyOf(selected.x, selected.y));
      if (tower) {
        const stats = towerStats(tower, game);
        context.strokeStyle = TOWER_DATA[tower.kind].color;
        context.setLineDash([6, 5]);
        context.lineWidth = 2;
        context.beginPath();
        context.arc(
          (selected.x + 0.5) * CELL,
          (selected.y + 0.5) * CELL,
          stats.range * CELL,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.setLineDash([]);
        context.strokeRect(
          selected.x * CELL + 2,
          selected.y * CELL + 2,
          CELL - 4,
          CELL - 4,
        );
      }
    }

    for (const effect of game.spellEffects) {
      const remaining = Math.max(0, effect.endsAt - game.elapsed);
      if (effect.kind === "solar") {
        const progress = (game.elapsed - effect.startedAt) / (effect.endsAt - effect.startedAt);
        context.globalAlpha = Math.max(0, 1 - progress);
        context.fillStyle = "rgba(255, 226, 92, .5)";
        context.beginPath();
        context.arc(effect.center.x * CELL, effect.center.y * CELL, 2.6 * CELL * (0.7 + progress * 0.3), 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#fff4a6";
        context.lineWidth = 8 * (1 - progress) + 2;
        context.beginPath();
        context.arc(effect.center.x * CELL, effect.center.y * CELL, 4.2 * CELL * progress, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      } else if (effect.kind === "ice") {
        const pulse = 0.86 + Math.sin(game.elapsed * Math.PI * 2) * 0.08;
        context.fillStyle = "rgba(118, 220, 255, .2)";
        context.strokeStyle = "rgba(198, 246, 255, .9)";
        context.lineWidth = 3;
        context.setLineDash([5, 8]);
        context.beginPath();
        context.arc(effect.center.x * CELL, effect.center.y * CELL, 3.5 * CELL * pulse, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.setLineDash([]);
        for (let shard = 0; shard < 12; shard += 1) {
          const angle = shard * 2.4 + game.elapsed * (1.6 + (shard % 3) * 0.2);
          const radius = (0.5 + (shard % 4) * 0.7) * CELL;
          const x = effect.center.x * CELL + Math.cos(angle) * radius;
          const y = effect.center.y * CELL + Math.sin(angle) * radius;
          context.fillStyle = "#d9f8ff";
          context.fillRect(x - 2, y - 5, 4, 10);
        }
      } else if (effect.kind === "tornado") {
        const x = effect.x * CELL;
        const y = effect.y * CELL;
        context.strokeStyle = "rgba(229, 255, 210, .9)";
        context.lineWidth = 4;
        for (let ring = 0; ring < 3; ring += 1) {
          context.beginPath();
          context.arc(x, y - ring * 7, 9 + ring * 5 + Math.sin(game.elapsed * 8 + ring) * 2, 0.2, Math.PI * 1.8);
          context.stroke();
        }
      } else {
        const progress = 1 - remaining / (effect.endsAt - effect.startedAt);
        context.globalAlpha = Math.max(0, 1 - progress);
        context.fillStyle = "rgba(236, 139, 215, .28)";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.strokeStyle = "#f5d0ed";
        context.lineWidth = 12 * (1 - progress) + 2;
        context.strokeRect(progress * WIDTH * 0.48, progress * HEIGHT * 0.48, WIDTH * (1 - progress * 0.96), HEIGHT * (1 - progress * 0.96));
        context.globalAlpha = 1;
      }
    }

    const sortedEnemies = [...game.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sortedEnemies) {
      const next = enemy.path[enemy.pathIndex + 1];
      const facing = next && next.x + 0.5 < enemy.x ? -1 : 1;
      const size = enemy.invader === BOSS ? 46 : 34;
      const bob = Math.sin(game.elapsed * 7 + enemy.id) * 1.2;

      if (enemy.stunUntil > game.elapsed || enemy.blindUntil > game.elapsed) {
        context.fillStyle = enemy.blindUntil > game.elapsed
          ? "rgba(255, 224, 92, .34)"
          : "rgba(255, 244, 190, .24)";
        context.beginPath();
        context.arc(enemy.x * CELL, enemy.y * CELL, 18, 0, Math.PI * 2);
        context.fill();
      }
      if (enemy.slowUntil > game.elapsed) {
        context.fillStyle = "rgba(120, 225, 255, .32)";
        context.beginPath();
        context.arc(enemy.x * CELL, enemy.y * CELL, 16, 0, Math.PI * 2);
        context.fill();
      }

      context.save();
      context.translate(enemy.x * CELL, enemy.y * CELL + bob);
      context.scale(size / 100, size / 100);
      drawBlightling(context, enemy.invader.art, game.elapsed, enemy.id * 0.7, facing);
      context.restore();

      drawHealthBar(
        context,
        enemy.x * CELL,
        enemy.y * CELL - size / 2 - 8,
        Math.max(0, enemy.hp / enemy.maxHp),
        enemy.invader === BOSS ? 34 : 26,
      );
    }

    for (const projectile of game.projectiles) {
      drawShot(
        context,
        projectile.kind,
        { x: projectile.from.x * CELL, y: projectile.from.y * CELL },
        { x: projectile.to.x * CELL, y: projectile.to.y * CELL },
        Math.min(1, projectile.age / projectile.duration),
        projectile.seed,
        projectile.arc ?? false,
      );
    }
  }, []);

  useEffect(() => {
    const frame = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      updateGame(delta);
      drawGame();
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);
    const interval = window.setInterval(refresh, 180);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.clearInterval(interval);
    };
  }, [drawGame, refresh, updateGame]);

  const cancelSpell = useCallback(
    (announce = true) => {
      const kind = selectedSpellRef.current;
      if (!kind) return false;
      const game = gameRef.current;
      const refund = spellCost(game, kind);
      if (game.spellCharges[kind] > 0) {
        game.spellCharges[kind] -= 1;
        game.gold += refund;
        game.goldSpent = Math.max(0, game.goldSpent - refund);
      }
      selectedSpellRef.current = null;
      setSelectedSpell(null);
      if (announce) {
        game.message = `${SPELL_DATA[kind].name} cancelled — ${formatNumber(refund)} gold refunded.`;
        game.messageUntil = game.elapsed + 3.5;
      }
      refresh();
      return true;
    },
    [refresh],
  );

  const selectTower = useCallback((kind: TowerKind) => {
    cancelSpell(false);
    buildingRef.current = true;
    setSelectedKind(kind);
    setIsBuilding(true);
    setSelectedCell(null);
  }, [cancelSpell]);

  const cancelBuilding = useCallback(() => {
    if (!buildingRef.current) return false;
    buildingRef.current = false;
    setIsBuilding(false);
    hoverRef.current = null;
    refresh();
    return true;
  }, [refresh]);

  const selectSpell = useCallback(
    (kind: SpellKind) => {
      const game = gameRef.current;
      if (game.phase === "gameover" || game.pendingBuffChoices) return;
      const spell = SPELL_DATA[kind];
      const cost = spellCost(game, kind);
      if (game.spellEffects.some((effect) => effect.kind === kind)) {
        notify(spell.name + " is already active.");
        return;
      }
      if (selectedSpellRef.current === kind) {
        cancelSpell();
        return;
      }
      if (selectedSpellRef.current) cancelSpell(false);
      if (game.spellCharges[kind] <= 0) {
        if (game.gold < cost) {
          notify(`Need ${formatNumber(cost - game.gold)} more gold for ${spell.name}.`);
          return;
        }
        game.gold -= cost;
        game.goldSpent += cost;
        game.spellCharges[kind] += 1;
      }
      selectedSpellRef.current = kind;
      setSelectedCell(null);
      setSelectedSpell(kind);
      game.message = `${spell.name} armed — click the field to cast.`;
      game.messageUntil = game.elapsed + 4;
      refresh();
    },
    [cancelSpell, notify, refresh],
  );

  const castSpell = useCallback(
    (kind: SpellKind, center: Point) => {
      const game = gameRef.current;
      if (game.spellCharges[kind] <= 0 || game.phase === "gameover") return;
      const spellPower = 55 * Math.pow(1.16, Math.max(0, game.wave - 1));

      if (kind === "solar") {
        const sunRank = buffRank(game, "sunCrowned");
        const stunTargets = spellTargets(
          game,
          (enemy) => distance(center, { x: enemy.x, y: enemy.y }) <= 4.2,
          32 + sunRank * 10,
        );
        const damageTargets = spellTargets(
          game,
          (enemy) => distance(center, { x: enemy.x, y: enemy.y }) <= 2.6,
          18 + sunRank * 6,
        );
        for (const enemy of stunTargets) {
          enemy.stunUntil = Math.max(enemy.stunUntil, game.elapsed + 2);
        }
        for (const enemy of damageTargets) {
          enemy.stunUntil = Math.max(enemy.stunUntil, game.elapsed + 2);
          enemy.blindUntil = Math.max(enemy.blindUntil, game.elapsed + 2);
          damageEnemyWithSpell(
            game,
            enemy,
            spellPower * 4.8 * (1 + sunRank * 0.12),
          );
        }
        game.spellEffects.push({
          kind: "solar",
          center,
          startedAt: game.elapsed,
          endsAt: game.elapsed + 0.9,
        });
      } else if (kind === "ice") {
        game.spellEffects.push({
          kind: "ice",
          center,
          startedAt: game.elapsed,
          endsAt: game.elapsed + 6,
          nextTick: game.elapsed + 1,
        });
      } else if (kind === "tornado") {
        const stormRank = buffRank(game, "stormShepherd");
        const tornadoCount = Math.min(6, 3 + stormRank);
        for (let index = 0; index < tornadoCount; index += 1) {
          game.spellEffects.push({
            kind: "tornado",
            x: center.x,
            y: center.y,
            angle:
              (Math.PI * 2 * index) / tornadoCount + game.rng() * 0.7,
            turnAt: game.elapsed + 0.5 + game.rng(),
            endsAt: game.elapsed + 30,
            hits: {},
            resetsLeft: 10 + stormRank * 3,
          });
        }
      } else {
        const mercyRank = buffRank(game, "verdantMercy");
        const executeThreshold = Math.min(0.6, 0.25 + mercyRank * 0.05);
        const targets = spellTargets(
          game,
          () => true,
          40 + mercyRank * 10,
        );
        for (const enemy of targets) {
          const damage =
            enemy.hp / enemy.maxHp <= executeThreshold
              ? enemy.hp
              : enemy.maxHp * 0.28;
          damageEnemyWithSpell(game, enemy, damage);
        }
        game.health = Math.min(MAX_HEALTH, game.health + 3 + mercyRank * 2);
        game.spellEffects.push({
          kind: "bloom",
          startedAt: game.elapsed,
          endsAt: game.elapsed + 1.25,
        });
      }

      game.spellCharges[kind] -= 1;
      game.spellCasts[kind] += 1;
      game.spellsCast += 1;
      game.message = SPELL_DATA[kind].name + " unleashed!";
      game.messageUntil = game.elapsed + 3;
      selectedSpellRef.current = null;
      setSelectedSpell(null);
      refresh();
    },
    [damageEnemyWithSpell, refresh],
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: Math.floor(((event.clientX - bounds.left) / bounds.width) * COLS),
        y: Math.floor(((event.clientY - bounds.top) / bounds.height) * ROWS),
      };
      const game = gameRef.current;
      const armedSpell = selectedSpellRef.current;
      if (armedSpell) {
        castSpell(armedSpell, { x: point.x + 0.5, y: point.y + 0.5 });
        return;
      }
      const key = keyOf(point.x, point.y);
      if (game.towers.has(key)) {
        setSelectedCell((current) =>
          current && current.x === point.x && current.y === point.y ? null : point,
        );
        return;
      }
      if (!buildingRef.current) return;
      if (game.phase === "gameover") {
        return;
      }
      if (
        (point.x === START.x && point.y === START.y) ||
        (point.x === CITY.x && point.y === CITY.y)
      ) {
        notify("The Blight rift and Heartwood must stay clear.");
        return;
      }
      if (
        game.enemies.some(
          (enemy) =>
            Math.floor(enemy.x) === point.x && Math.floor(enemy.y) === point.y,
        )
      ) {
        notify("A Blightling is already skittering through that patch.");
        return;
      }
      const data = TOWER_DATA[selectedKind];
      if (game.gold < data.cost) {
        notify(`Need ${data.cost - game.gold} more gold for ${data.name}.`);
        return;
      }
      const tower: Tower = {
        kind: selectedKind,
        level: 1,
        spent: data.cost,
        cooldown: 0,
        damageDone: 0,
        kills: 0,
      };
      game.towers.set(key, tower);
      const route = createPath(game.towers, game.rng, false);
      if (!route) {
        game.towers.delete(key);
        notify("That blocks the last route to the Heartwood.");
        return;
      }
      game.route = route;
      rerouteEnemies(game);
      game.gold -= data.cost;
      game.goldSpent += data.cost;
      game.towersBuilt += 1;
      game.message = `${data.name} planted.`;
      game.messageUntil = game.elapsed + 1.7;
      refresh();
    },
    [castSpell, notify, refresh, selectedKind],
  );

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: Math.max(
          0,
          Math.min(
            COLS - 1,
            Math.floor(((event.clientX - bounds.left) / bounds.width) * COLS),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            ROWS - 1,
            Math.floor(((event.clientY - bounds.top) / bounds.height) * ROWS),
          ),
        ),
      };
      hoverRef.current = point;
    },
    [],
  );

  const startWave = useCallback(() => {
    const game = gameRef.current;
    if (game.phase === "gameover" || game.pendingBuffChoices) return;
    const pendingBlightlings =
      game.waveQueue.length + game.enemies.filter((enemy) => !enemy.dead).length;
    if (pendingBlightlings >= MAX_PENDING_BLIGHTLINGS) {
      notify("The rift is overloaded — clear Blightlings before rushing again.");
      return;
    }
    const chainActive = game.realElapsed - game.lastRushAt <= 4;
    const rushStreak = chainActive ? game.rushStreak + 1 : 1;
    const rushMultiplier = Math.min(2.5, 1 + (rushStreak - 1) * 0.25);
    const baseBonus = Math.max(1, Math.ceil(game.nextWaveIn));
    const bonus = Math.ceil(baseBonus * rushMultiplier);
    game.rushStreak = rushStreak;
    game.lastRushAt = game.realElapsed;
    game.timeSaved += Math.max(0, game.nextWaveIn);
    game.wavesRushed += 1;
    queueNextWave(game, bonus, rushStreak, rushMultiplier);
    syncBest(game.wave);
    setSelectedCell(null);
    refresh();
  }, [notify, refresh, syncBest]);

  const sellSelected = useCallback(() => {
    const game = gameRef.current;
    const cell = selectedCellRef.current;
    if (!cell || game.phase === "gameover") return;
    const key = keyOf(cell.x, cell.y);
    const tower = game.towers.get(key);
    if (!tower) return;
    const refund = Math.floor(tower.spent * 0.75);
    game.gold += refund;
    game.towers.delete(key);
    game.route = createPath(game.towers, game.rng, false) ?? [];
    rerouteEnemies(game);
    setSelectedCell(null);
    notify(`${TOWER_DATA[tower.kind].name} sold for ${formatNumber(refund)} gold.`);
    refresh();
  }, [notify, refresh]);

  const chooseBuff = useCallback(
    (kind: BuffKind) => {
      const game = gameRef.current;
      if (!game.pendingBuffChoices?.includes(kind)) return;
      game.buffs.push(kind);
      game.pendingBuffChoices = null;
      game.paused = false;
      const rank = buffRank(game, kind);
      game.message = `${BUFF_DATA[kind].name} joined your build${rank > 1 ? ` · rank ${rank}` : ""}.`;
      game.messageUntil = game.elapsed + 4;
      refresh();
    },
    [refresh],
  );

  const upgradeSelected = useCallback(() => {
    const game = gameRef.current;
    const cell = selectedCellRef.current;
    if (!cell) {
      notify("Select a guardian to upgrade first.");
      return;
    }
    const tower = game.towers.get(keyOf(cell.x, cell.y));
    if (!tower) return;
    const cost = upgradeCost(tower);
    if (cost === null) {
      notify(`${TOWER_DATA[tower.kind].name} is already level ${MAX_TOWER_LEVEL}.`);
      return;
    }
    if (game.gold < cost) {
      notify(`Need ${formatNumber(cost - game.gold)} more gold to upgrade.`);
      return;
    }
    game.gold -= cost;
    game.goldSpent += cost;
    tower.spent += cost;
    tower.level += 1;
    game.towerUpgrades += 1;
    game.message = `${TOWER_DATA[tower.kind].name} reached level ${tower.level}!`;
    game.messageUntil = game.elapsed + 3;
    refresh();
  }, [notify, refresh]);

  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (game.phase !== "wave") return;
    game.paused = !game.paused;
    refresh();
  }, [refresh]);

  const setSpeed = useCallback(
    (speed: number) => {
      gameRef.current.speed = speed;
      refresh();
    },
    [refresh],
  );

  const restart = useCallback(() => {
    const bestWave = gameRef.current.bestWave;
    const next = createGame();
    next.bestWave = bestWave;
    gameRef.current = next;
    selectedSpellRef.current = null;
    setSelectedCell(null);
    setSelectedSpell(null);
    setSelectedKind("thorn");
    setRunSubmitted(false);
    lastTimeRef.current = 0;
    lastSavedRef.current = null;
    void persistGame();
    refresh();
  }, [persistGame, refresh]);

  const requestRestart = useCallback(() => {
    if (window.confirm("Start a fresh run? Your current maze will be lost.")) {
      restart();
    }
  }, [restart]);

  const openHelp = useCallback(() => {
    const game = gameRef.current;
    helpPausedRef.current = game.paused;
    if (game.phase === "wave") game.paused = true;
    setHelpOpen(true);
    refresh();
  }, [refresh]);

  const closeHelp = useCallback(() => {
    const game = gameRef.current;
    if (game.phase === "wave") game.paused = helpPausedRef.current;
    setHelpOpen(false);
    refresh();
  }, [refresh]);

  const openIntro = useCallback(() => {
    const game = gameRef.current;
    introPausedRef.current = helpOpen ? helpPausedRef.current : game.paused;
    game.paused = true;
    setHelpOpen(false);
    setIntroStep(0);
    setIntroOpen(true);
    refresh();
  }, [helpOpen, refresh]);

  const closeIntro = useCallback(() => {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, "seen");
    } catch {
      // The tour still works when browser storage is unavailable.
    }
    gameRef.current.paused = introPausedRef.current;
    setIntroOpen(false);
    refresh();
  }, [refresh]);

  const nextIntroStep = useCallback(() => {
    if (introStep >= INTRO_STEPS.length - 1) {
      closeIntro();
      return;
    }
    setIntroStep(introStep + 1);
  }, [closeIntro, introStep]);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_STORAGE_KEY) === "seen";
    } catch {
      seen = false;
    }
    const releasePreviewRequested =
      new URLSearchParams(window.location.search).get("release-preview") === "1";
    if (seen || whatsNewOpen || releasePreviewRequested) return;
    const game = gameRef.current;
    introPausedRef.current = game.paused;
    game.paused = true;
    setIntroStep(0);
    setIntroOpen(true);
    refresh();
  }, [refresh, whatsNewOpen]);

  useEffect(() => {
    if (!introOpen) {
      setIntroHighlight(null);
      return;
    }

    const updateHighlight = () => {
      const target = [
        boardRef,
        boardRef,
        healthRef,
        guardianDockRef,
        hudActionsRef,
      ][introStep].current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const padding = introStep <= 1 ? 3 : 8;
      setIntroHighlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        right: rect.right + padding,
        bottom: rect.bottom + padding,
      });
    };

    const frame = requestAnimationFrame(updateHighlight);
    window.addEventListener("resize", updateHighlight);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateHighlight);
    };
  }, [introOpen, introStep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (whatsNewOpen) return;
      if (event.key === "Tab") {
        if (
          !introOpen &&
          !helpOpen &&
          !profileOpen &&
          !leaderboardOpen &&
          !groveBuildOpen &&
          !gameRef.current.pendingBuffChoices
        ) {
          event.preventDefault();
          if (!event.repeat) {
            setRunOverviewOpen(true);
            refresh();
          }
        }
        return;
      }
      if (introOpen) {
        if (event.key === "Escape") closeIntro();
        else if (event.key === "ArrowLeft") {
          setIntroStep((step) => Math.max(0, step - 1));
        } else if (event.key === "ArrowRight" || event.key === "Enter") {
          nextIntroStep();
        }
        return;
      }
      if (helpOpen) {
        if (
          event.key === "Escape" ||
          event.key.toLowerCase() === "h" ||
          event.key === "?"
        ) {
          event.preventDefault();
          closeHelp();
        }
        return;
      }
      if (profileOpen) {
        if (event.key === "Escape" && !isNewProfile) setProfileOpen(false);
        return;
      }
      if (gameRef.current.pendingBuffChoices) return;
      if (event.shiftKey && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        selectSpell(SPELL_ORDER[Number(event.code.slice(-1)) - 1]);
      } else if (event.key >= "1" && event.key <= "4") {
        selectTower(TOWER_ORDER[Number(event.key) - 1]);
      } else if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) startWave();
      } else if (event.key.toLowerCase() === "p") {
        togglePause();
      } else if (event.key.toLowerCase() === "u") {
        upgradeSelected();
      } else if (event.key.toLowerCase() === "s") {
        sellSelected();
      } else if (event.key.toLowerCase() === "f") {
        setSpeed(gameRef.current.speed === 1 ? 2 : 1);
      } else if (event.key.toLowerCase() === "n") {
        requestRestart();
      } else if (
        event.key.toLowerCase() === "h" ||
        (event.key === "?" && event.shiftKey)
      ) {
        if (helpOpen) closeHelp();
        else openHelp();
      } else if (event.key === "Escape") {
        if (helpOpen) closeHelp();
        else if (selectedSpellRef.current) cancelSpell();
        else if (cancelBuilding()) return;
        else setSelectedCell(null);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Tab") setRunOverviewOpen(false);
    };
    const closeRunOverview = () => setRunOverviewOpen(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", closeRunOverview);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", closeRunOverview);
    };
  }, [cancelBuilding, cancelSpell, closeHelp, closeIntro, groveBuildOpen, helpOpen, introOpen, isNewProfile, leaderboardOpen, nextIntroStep, openHelp, profileOpen, refresh, requestRestart, selectSpell, selectTower, sellSelected, setSpeed, startWave, togglePause, upgradeSelected, whatsNewOpen]);

  const game = gameRef.current;
  const inspectedTower = selectedCell
    ? game.towers.get(keyOf(selectedCell.x, selectedCell.y))
    : undefined;
  const inspectedUpgradeCost = inspectedTower ? upgradeCost(inspectedTower) : null;
  const nextInvaders = useMemo(() => upcomingInvaders(game.wave), [game.wave]);
  const rushWindow = Math.max(0, 4 - (game.realElapsed - game.lastRushAt));
  const nextRushStreak = rushWindow > 0 ? game.rushStreak + 1 : 1;
  const nextRushMultiplier = Math.min(
    2.5,
    1 + (nextRushStreak - 1) * 0.25,
  );
  const rushBonus = Math.ceil(Math.max(1, game.nextWaveIn) * nextRushMultiplier);
  const waveAnnouncement =
    game.waveAnnouncement && game.waveAnnouncement.expiresAt > Date.now()
      ? game.waveAnnouncement
      : null;
  const selectedLeaderboardRun =
    leaderboard.find((run) => run.id === selectedRunId) ?? leaderboard[0] ?? null;

  const boardMessage = selectedSpell
    ? `${SPELL_DATA[selectedSpell].name} armed — click the field to cast or press Esc to cancel.`
    : game.messageUntil > game.elapsed
        ? game.message
        : null;

  return (
    <main className="game-shell">
      {whatsNewOpen ? (
        <div className="whats-new-backdrop" role="presentation">
          <section className="whats-new-modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
            <div className="whats-new-version">
              {releasePreview ? "Preview · " : ""}Version {CURRENT_RELEASE.version}
            </div>
            <p className="eyebrow">What&apos;s new</p>
            <h2 id="whats-new-title">{CURRENT_RELEASE.title}</h2>
            <p className="whats-new-summary">{CURRENT_RELEASE.summary}</p>
            <div className="release-category-grid">
              {CURRENT_RELEASE.categories.map((category) => (
                <section key={category.name}>
                  <h3>{category.name}</h3>
                  <ul>
                    {category.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </div>
            {releaseDismissError ? <p className="form-error">{releaseDismissError}</p> : null}
            <button className="primary-action" onClick={dismissWhatsNew}>
              {releasePreview ? "Close preview" : "Enter the grove"}
            </button>
          </section>
        </div>
      ) : null}
      <section className="game-surface">
        <div className="board-frame">
          <header className="hud-topbar">
            <div className="brand-lockup">
              <div className="brand-mark">ND</div>
              <h1>Nature&apos;s Last Stand</h1>
            </div>

            <div className="hud-stats" aria-label="Current run statistics">
              <div className="stat gold-value">
                <b>{formatNumber(game.gold)}</b>
                <i>gold</i>
              </div>
              <div className="stat" ref={healthRef}>
                <b className={game.health <= 5 ? "danger-value" : ""}>
                  {game.health}
                  <small>/{MAX_HEALTH}</small>
                </b>
                <i>heartwood</i>
              </div>
            </div>

            <div ref={hudActionsRef} className="hud-actions">
              <span className={`phase-pill ${game.phase}`}>
                <b>Wave {formatNumber(game.wave)}</b>
                {game.phase === "gameover" ? "Wilted" : game.paused ? "Paused" : null}
              </span>
              <div className="rush-control" title="Rush again within 4s for +25% gold, up to 2.5×">
                <button
                  className={`rush-button ${rushWindow > 0 ? "chain-active" : ""}`}
                onClick={startWave}
                disabled={game.phase === "gameover"}
                aria-label={
                  rushWindow > 0
                    ? `Continue rush chain at ${nextRushMultiplier.toFixed(2)} times gold`
                    : `Call wave ${game.wave + 1} early`
                }
                style={
                  {
                    "--rush-window": `${(rushWindow / 4) * 100}%`,
                  } as React.CSSProperties
                }
              >
                {rushWindow > 0 ? `Chain ×${nextRushStreak}` : "Rush"}
                {" "}+{formatNumber(rushBonus)} <kbd>Space</kbd>
                </button>
              </div>
              <div className="segmented">
                <button
                  className={game.speed === 1 ? "active" : ""}
                  onClick={() => setSpeed(1)}
                  aria-label="Normal speed"
                >
                  1×
                </button>
                <button
                  className={game.speed === 2 ? "active" : ""}
                  onClick={() => setSpeed(2)}
                  aria-label="Double speed"
                >
                  2×
                </button>
                <button
                  onClick={togglePause}
                  disabled={game.phase !== "wave"}
                  aria-label={game.paused ? "Resume" : "Pause"}
                >
                  {game.paused ? "▶" : "Ⅱ"}
                </button>

                <hr />

                {game.buffs.length ? (
                  <button
                    className="grove-build-button"
                    onClick={() => setGroveBuildOpen(true)}
                    aria-label={`View current Grove build (${game.buffs.length} blessings)`}
                    title="Grove build"
                  >
                    🌿
                    <b>{game.buffs.length}</b>
                  </button>
                ) : null}
                <button
                  onClick={openWhatsNew}
                  aria-label="Open What's New"
                  title={`What's New · v${CURRENT_RELEASE.version}`}
                >
                  ✨
                </button>
                <button
                  onClick={openHelp}
                  aria-label="Open game help"
                  title="Help (H)"
                >
                  ?
                </button>
                <button
                  onClick={openLeaderboard}
                  aria-label="Open leaderboard"
                  title="Top 10 runs"
                >
                  🏆
                </button>
                <button
                  onClick={requestRestart}
                  aria-label="Restart the current run"
                  title="New run (N)"
                >
                  ↻
                </button>
              </div>
              <button
                type="button"
                className="account-chip"
                onClick={() => setProfileOpen(true)}
                title={`Signed in as ${email}`}
              >
                <span aria-hidden="true">✿</span>
                <strong>{displayName}</strong>
                {saveError ? (
                  <em aria-live="polite" title="Save failed">
                    !
                  </em>
                ) : null}
              </button>
            </div>
          </header>

          <div className="canvas-stage">
            {boardMessage ? (
              <div className="game-message" aria-live="polite">
                <span>✦</span>
                {boardMessage}
              </div>
            ) : null}

            <div className="run-ticker" aria-label="Run totals">
              <span>{formatNumber(game.kills)} cleared</span>
              <span>{formatNumber(game.damage)} cleansing</span>
            </div>

            <div className="wave-peek" aria-label={`Upcoming wave ${game.wave + 1}`}>
              <span>
                Next · {formatNumber((game.wave + 1) % 5 === 0 ? 1 : 8 + (game.wave + 1) * 2)}
              </span>
              <div>
                {nextInvaders.map((invader) => (
                  <span key={invader.name} title={invader.name}>
                    <BlightIcon invader={invader} size={26} />
                  </span>
                ))}
              </div>
            </div>

            <div className="board-playfield" ref={boardRef}>
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                className={
                  game.phase === "gameover"
                    ? ""
                    : selectedSpell
                      ? "casting"
                      : isBuilding
                        ? "building"
                        : ""
                }
                onClick={handleCanvasClick}
                onMouseMove={handlePointerMove}
                onMouseLeave={() => {
                  hoverRef.current = null;
                }}
                aria-label="20 by 10 tower defense game board"
              />

              {waveAnnouncement ? (
                <div
                  key={waveAnnouncement.wave}
                  className={`wave-announcement ${waveAnnouncement.earlyBonus ? "rush-chain" : ""} ${waveAnnouncement.bossWave ? "boss-wave" : ""}`}
                  role="status"
                  aria-live="assertive"
                >
                  <p>
                    {waveAnnouncement.bossWave
                      ? "Boss wave"
                      : waveAnnouncement.rushStreak > 1
                        ? `Rush chain ×${waveAnnouncement.rushStreak}`
                        : waveAnnouncement.earlyBonus
                          ? "Wave rushed"
                          : "The rift stirs"}
                  </p>
                  <h2>Wave {waveAnnouncement.wave}</h2>
                  <strong>
                    {waveAnnouncement.bossWave
                      ? `The Grime King stands alone · ${formatNumber(BOSS.bounty)}+ gold bounty`
                      : `${formatNumber(waveAnnouncement.total)} creatures incoming`}
                  </strong>
                  <div className="wave-roster">
                    {waveAnnouncement.roster.map(({ invader, count }) => (
                      <span key={invader.name}>
                        <BlightIcon invader={invader} size={28} />
                        <b>{formatNumber(count)}×</b> {invader.name}
                      </span>
                    ))}
                  </div>
                  <small>
                    +{formatNumber(waveAnnouncement.levelBonus)} level gold
                    {waveAnnouncement.earlyBonus > 0
                      ? ` · +${formatNumber(waveAnnouncement.earlyBonus)} rush gold · ${waveAnnouncement.rushMultiplier.toFixed(2)}×`
                      : ""}
                  </small>
                </div>
              ) : null}

              {game.pendingBuffChoices ? (
                <div className="buff-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="buff-choice-title">
                  <div className="buff-choice-heading">
                    <span aria-hidden="true">♛</span>
                    <div>
                      <p>Grime King defeated</p>
                      <h2 id="buff-choice-title">Choose a Grove Blessing</h2>
                      <small>Permanent for this run · choose one</small>
                    </div>
                  </div>
                  <div className="buff-card-grid">
                    {game.pendingBuffChoices.map((kind) => {
                      const buff = BUFF_DATA[kind];
                      const nextRank = buffRank(game, kind) + 1;
                      return (
                        <button
                          key={kind}
                          onClick={() => chooseBuff(kind)}
                          style={{ "--buff-color": buff.color } as React.CSSProperties}
                        >
                          <span className="buff-card-icon" aria-hidden="true">{buff.icon}</span>
                          <span className="buff-card-family">{buff.family}</span>
                          <strong>{buff.name}</strong>
                          <p>{buff.description}</p>
                          <small>{nextRank > 1 ? `Upgrade to rank ${nextRank}` : "Add to this run"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}


              {rushWindow > 0 && !waveAnnouncement ? (
                <div
                  className="rush-chain-hud"
                  style={
                    {
                      "--rush-progress": `${(rushWindow / 4) * 100}%`,
                    } as React.CSSProperties
                  }
                >
                  <strong>
                    {game.rushStreak > 1 ? `Rush chain ×${game.rushStreak}` : "Rush chain ready"}
                  </strong>
                  <span>{rushWindow.toFixed(1)}s · next gold {nextRushMultiplier.toFixed(2)}×</span>
                </div>
              ) : null}

              {selectedCell && inspectedTower && (
                <div
                  className={`tower-popover ${selectedCell.y < 3 ? "below" : ""} ${
                    selectedCell.x < 3
                      ? "edge-left"
                      : selectedCell.x > COLS - 4
                        ? "edge-right"
                        : ""
                  }`}
                  style={{
                    left: `${((selectedCell.x + 0.5) / COLS) * 100}%`,
                    top: `${((selectedCell.y + 0.5) / ROWS) * 100}%`,
                  }}
                >
                  <span className="tower-portrait">
                    <TowerIcon
                      kind={inspectedTower.kind}
                      size={44}
                      level={inspectedTower.level}
                    />
                  </span>
                  <strong>{TOWER_DATA[inspectedTower.kind].name}</strong>
                  <span className="tower-level">Level {inspectedTower.level}/{MAX_TOWER_LEVEL}</span>
                  <span>
                    {formatNumber(inspectedTower.kills)} cleared · {formatNumber(inspectedTower.damageDone)} cleansing
                  </span>
                  <span>
                    {Math.round(towerStats(inspectedTower, game).damage)} damage · {towerStats(inspectedTower, game).rate.toFixed(1)}/s · {towerStats(inspectedTower, game).range.toFixed(1)} range
                  </span>
                  <div className="tower-actions">
                    <button
                      className="upgrade-action"
                      onClick={upgradeSelected}
                      disabled={inspectedUpgradeCost === null}
                    >
                      {inspectedUpgradeCost === null
                        ? "Maximum level"
                        : `Upgrade · ${formatNumber(inspectedUpgradeCost)} gold`} <kbd>U</kbd>
                    </button>
                    <button className="sell-action" onClick={sellSelected}>
                      Sell +{formatNumber(Math.floor(inspectedTower.spent * 0.75))} <kbd>S</kbd>
                    </button>
                  </div>
                </div>
              )}

              {game.phase === "gameover" && (
                <div className="game-over">
                  <div className="game-over-card">
                    <p className="eyebrow">The grove remembers your stand</p>
                    <h2>Wave {formatNumber(game.wave)}</h2>
                    <p className="game-over-lede">
                      The Heartwood wilted, but your guardian maze left a legend behind.
                    </p>

                    <div className="run-stats" aria-label="Final run statistics">
                      <div className="featured">
                        <span>Blightlings cleansed</span>
                        <strong>{formatNumber(game.kills)}</strong>
                      </div>
                      <div className="featured">
                        <span>Cleansing damage</span>
                        <strong>{formatNumber(game.damage)}</strong>
                      </div>
                      <div>
                        <span>Gold earned</span>
                        <strong>{formatNumber(game.goldEarned)}</strong>
                      </div>
                      <div>
                        <span>Gold invested</span>
                        <strong>{formatNumber(game.goldSpent)}</strong>
                      </div>
                      <div>
                        <span>Guardians planted</span>
                        <strong>{formatNumber(game.towersBuilt)}</strong>
                      </div>
                      <div>
                        <span>Boss blessings</span>
                        <strong>{formatNumber(game.buffs.length)}</strong>
                      </div>
                      <div>
                        <span>Guardian upgrades</span>
                        <strong>{formatNumber(game.towerUpgrades)}</strong>
                      </div>
                      <div>
                        <span>Battle time</span>
                        <strong>{formatDuration(game.realElapsed)}</strong>
                      </div>
                      <div>
                        <span>Spells unleashed</span>
                        <strong>{formatNumber(game.spellsCast)}</strong>
                      </div>
                    </div>

                    <div className={`rush-recap ${game.wavesRushed ? "" : "quiet"}`}>
                      <span className="rush-icon" aria-hidden="true">↯</span>
                      {game.wavesRushed ? (
                        <div>
                          <strong>{formatNumber(game.wavesRushed)} waves rushed</strong>
                          <p>
                            +{formatNumber(game.rushGold)} bonus gold · {formatDuration(game.timeSaved)} pulled forward
                          </p>
                        </div>
                      ) : (
                        <div>
                          <strong>No waves rushed</strong>
                          <p>Call waves early next run to bend time and earn bonus gold.</p>
                        </div>
                      )}
                    </div>

                    <div className="saved-run-actions">
                      {saveError ? (
                        <p role="alert" className="auth-error">
                          Could not post this run: {saveError}
                        </p>
                      ) : runSubmitted ? (
                        <p>
                          Run posted as <strong>{displayName}</strong>.
                        </p>
                      ) : (
                        <p aria-live="polite">Posting your run…</p>
                      )}
                      {saveError ? (
                        <button type="button" onClick={() => void publishRun()}>
                          Try again
                        </button>
                      ) : null}
                      <button type="button" onClick={openLeaderboard}>
                        View leaderboard
                      </button>
                      <button className="primary-action" onClick={restart}>
                        Grow another last stand
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="footer-controls">
              <div
                ref={guardianDockRef}
              className="guardian-dock"
              aria-label="Guardian build shortcuts"
            >
              {TOWER_ORDER.map((kind) => {
                const tower = TOWER_DATA[kind];
                return (
                  <button
                    key={kind}
                    className={isBuilding && selectedKind === kind ? "selected" : ""}
                    onClick={() => selectTower(kind)}
                    disabled={game.phase === "gameover" || Boolean(game.pendingBuffChoices)}
                    aria-label={`Select ${tower.name}, ${tower.cost} gold. ${tower.description}`}
                    aria-describedby={`tower-tooltip-${kind}`}
                    style={{ "--tower-color": tower.color } as React.CSSProperties}
                  >
                    <span className="tile-meta">
                      <kbd>{tower.hotkey}</kbd>
                      <small>{tower.cost}</small>
                    </span>
                    <span className="dock-art">
                      <TowerIcon kind={kind} size={40} />
                    </span>
                    <span className="tile-name">{tower.name}</span>
                    <span
                      id={`tower-tooltip-${kind}`}
                      className="guardian-tooltip"
                      role="tooltip"
                    >
                      <strong>{tower.name}</strong>
                      <span>{tower.description}</span>
                      <span className="tooltip-stats">
                        {tower.damage} damage · {tower.rate.toFixed(1)}/s · {tower.range.toFixed(1)} range
                      </span>
                      <span className="tooltip-cost">
                        {tower.cost} gold · press {tower.hotkey}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <hr className="dock-split" />

            <div className="spell-dock" aria-label="One-use spell purchases">
              {SPELL_ORDER.map((kind) => {
                const spell = SPELL_DATA[kind];
                const charges = game.spellCharges[kind];
                const cost = spellCost(game, kind);
                return (
                  <button
                    key={kind}
                    className={`${selectedSpell === kind ? "selected" : ""} ${charges ? "charged" : ""}`}
                    onClick={() => selectSpell(kind)}
                    disabled={game.phase === "gameover" || Boolean(game.pendingBuffChoices)}
                    style={{ "--spell-color": spell.color } as React.CSSProperties}
                    aria-label={`${charges ? "Arm" : "Buy and arm"} ${spell.name}. ${spell.description}`}
                  >
                    <span className="tile-meta">
                      <kbd>{spell.hotkey}</kbd>
                      <small>{charges ? `×${charges}` : formatNumber(cost)}</small>
                    </span>
                    <span className="spell-icon" aria-hidden="true">{spell.icon}</span>
                    <span className="tile-name">{spell.name}</span>
                    <span className="spell-tooltip" role="tooltip">
                      <strong>{spell.name}</strong>
                      <span>{spell.description}</span>
                      <span>{charges ? `${charges} charge ready` : `Buy one charge for ${formatNumber(cost)} gold`}</span>
                      <b>Press {spell.hotkey}, then click the field</b>
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      </section>

      {leaderboardOpen && (
        <div
          className="help-backdrop"
          role="presentation"
          onMouseDown={() => setLeaderboardOpen(false)}
        >
          <section
            className="leaderboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaderboard-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Grove legends</p>
            <h2 id="leaderboard-title">Top 10 last stands</h2>
            {leaderboard.length ? (
              <div className="leaderboard-layout">
                <ol className="leaderboard-list">
                  {leaderboard.slice(0, 10).map((run, index) => (
                    <li key={run.id}>
                      <button
                        className={selectedLeaderboardRun?.id === run.id ? "selected" : ""}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <span>{index + 1}</span>
                        <strong>{run.name}</strong>
                        <b>Wave {formatNumber(run.wave)}</b>
                        <small>{formatNumber(run.stats.kills)} cleared</small>
                        <time>
                          {new Date(run.playedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </button>
                    </li>
                  ))}
                </ol>
                {selectedLeaderboardRun && (
                  <RunDetails run={selectedLeaderboardRun} />
                )}
              </div>
            ) : (
              <div className="leaderboard-empty">
                <span aria-hidden="true">♛</span>
                <strong>No legends yet</strong>
                <p>Finish a run to claim the first place.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {runOverviewOpen ? (
        <div className="run-overview-backdrop">
          <CurrentRunOverview game={game} />
        </div>
      ) : null}

      {groveBuildOpen && (
        <div
          className="help-backdrop"
          role="presentation"
          onMouseDown={() => setGroveBuildOpen(false)}
        >
          <section
            className="grove-build-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grove-build-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Current run</p>
            <h2 id="grove-build-title">Grove build</h2>
            <div className="saved-buffs">
              {BUFF_ORDER.filter((kind) => buffRank(game, kind) > 0).map((kind) => {
                const rank = buffRank(game, kind);
                return (
                  <div
                    key={kind}
                    className="saved-buff-card"
                    style={{ "--buff-color": BUFF_DATA[kind].color } as React.CSSProperties}
                  >
                    <header>
                      <b>{BUFF_DATA[kind].icon}</b>
                      <div>
                        <strong>
                          {BUFF_DATA[kind].name}
                          {rank > 1 ? ` ×${rank}` : ""}
                        </strong>
                        <small>{buffFamilyLabel(kind)}</small>
                      </div>
                    </header>
                    <p>{BUFF_DATA[kind].description}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {helpOpen && (
        <div className="help-backdrop" role="presentation" onMouseDown={closeHelp}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Field guide</p>
            <h2 id="help-title">How to guard the Heartwood</h2>
            <div className="help-grid">
              <div>
                <h3>Build the maze</h3>
                <p>
                  Choose a guardian with 1–4, move over the grass, and click to
                  plant it. Guardians block the Blight, but every build must
                  leave a four-directional route to the Heartwood.
                </p>
              </div>
              <div>
                <h3>Beat the clock</h3>
                <p>
                  A mixed wave arrives every 30 seconds and every new wave grants
                  level gold. Press Space to call it early for bonus gold; rush
                  again within four seconds to build the multiplier. Every fifth
                  wave is one powerful Grime King carrying a large bounty.
                </p>
              </div>
              <div>
                <h3>Build under pressure</h3>
                <p>
                  You can plant or upgrade guardians during any wave. Select one
                  and press U to reach level 5. Press S to sell it for 75% of
                  all gold invested in that guardian.
                </p>
              </div>
              <div>
                <h3>Know the guardians</h3>
                <p>
                  Chickadees fire quickly, foxes slow, boars cleanse groups,
                  and wolves chain spirit sparks. Levels increase damage and
                  attack speed while strengthening each guardian&apos;s specialty.
                  Hover any guardian or spell card for its full stats.
                </p>
              </div>
              <div>
                <h3>Claim boss blessings</h3>
                <p>
                  Every Grime King drops three permanent tower mutations. Pick
                  one card to shape the run; your collected Grove build stays
                  visible in the board&apos;s bottom-right corner.
                </p>
              </div>
              <div>
                <h3>Buy wild magic</h3>
                <p>
                  Press Shift+1–4 to buy and arm a one-use spell, then click the
                  field to cast it. Each purchase grants one charge; casting consumes it. Repeated uses cost 16% more, up to 3×, and the same spell cannot overlap itself. Spells prioritize threats nearest the Heartwood and have target limits; Solar Flare shows separate damage and stun rings.
                </p>
              </div>
            </div>
            <h3 className="help-hotkey-title">Keyboard shortcuts</h3>
            <div className="help-hotkeys">
              <span><kbd>1–4</kbd> Choose guardian</span>
              <span><kbd>Shift+1–4</kbd> Buy/arm spell</span>
              <span><kbd>U</kbd> Upgrade selected</span>
              <span><kbd>S</kbd> Sell selected</span>
              <span><kbd>Space</kbd> Call wave</span>
              <span><kbd>F</kbd> Toggle speed</span>
              <span><kbd>P</kbd> Pause</span>
              <span><kbd>N</kbd> New run</span>
              <span><kbd>Hold Tab</kbd> Run overview</span>
              <span><kbd>Esc</kbd> Close or deselect</span>
              <span><kbd>H</kbd> Help</span>
            </div>
            <button className="primary-action" onClick={closeHelp}>
              Back to the grove
            </button>
            <button className="replay-intro-button" onClick={openIntro}>
              Replay guided intro
            </button>
          </section>
        </div>
      )}

      {profileOpen && (
        <div
          className="help-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!isNewProfile) setProfileOpen(false);
          }}
        >
          <section
            className="help-modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Guardian profile</p>
            <h2 id="profile-title">
              {isNewProfile ? "Claim your grove name" : "Your grove name"}
            </h2>
            <p className="auth-copy">
              {isNewProfile
                ? "Every last stand is recorded under this name — pick it before your first run."
                : "Change the name that appears on the leaderboard. Past runs update too."}
            </p>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                setNameError("");
                setNameSaved(false);
                startProfileTransition(async () => {
                  const result = await saveDisplayName(nameDraft);
                  if (!result.ok) {
                    setNameError(result.error);
                    return;
                  }
                  setDisplayName(nameDraft);
                  setNameSaved(true);
                  if (isNewProfile) setProfileOpen(false);
                });
              }}
            >
              <label htmlFor="display-name">Leaderboard name</label>
              <input
                id="display-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Fern Warden"
                minLength={2}
                maxLength={24}
                required
                autoFocus
              />
              <button
                className="primary-action"
                type="submit"
                disabled={profilePending}
              >
                {profilePending
                  ? "Saving…"
                  : isNewProfile
                    ? "Enter the grove"
                    : "Save name"}
              </button>
              {nameError ? (
                <p className="auth-error" role="alert">
                  {nameError}
                </p>
              ) : nameSaved ? (
                <p className="auth-hint" role="status">
                  Name saved.
                </p>
              ) : (
                <p className="auth-hint">
                  This is the name shown on every run you post. 2–24
                  characters, and it has to be unique.
                </p>
              )}
            </form>
            <footer className="profile-footer">
              <span>Signed in as {email}</span>
              <div>
                {!isNewProfile && (
                  <button type="button" onClick={() => setProfileOpen(false)}>
                    Back to the grove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    startProfileTransition(async () => {
                      await signOut();
                      router.push("/login");
                    })
                  }
                >
                  Sign out
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {introOpen ? (
        <div
          className={`intro-backdrop intro-${INTRO_STEPS[introStep].id}`}
          style={
            introHighlight
              ? ({
                  "--intro-target-top": `${introHighlight.top}px`,
                  "--intro-target-left": `${introHighlight.left}px`,
                  "--intro-target-right": `${introHighlight.right}px`,
                  "--intro-target-bottom": `${introHighlight.bottom}px`,
                  "--intro-target-center-x": `${introHighlight.left + introHighlight.width / 2}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {introHighlight ? (
            <div
              className="intro-spotlight"
              aria-hidden="true"
              style={{
                top: introHighlight.top,
                left: introHighlight.left,
                width: introHighlight.width,
                height: introHighlight.height,
              }}
            />
          ) : null}
          <section
            className="intro-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
          >
            <button className="intro-skip" onClick={closeIntro}>
              Skip intro
            </button>
            <div className="intro-progress" aria-label={`Step ${introStep + 1} of ${INTRO_STEPS.length}`}>
              {INTRO_STEPS.map((step, index) => (
                <span
                  key={step.id}
                  className={index === introStep ? "active" : ""}
                />
              ))}
            </div>
            <p className="eyebrow">{INTRO_STEPS[introStep].label}</p>
            <h2 id="intro-title">{INTRO_STEPS[introStep].title}</h2>
            <p className="intro-copy">{INTRO_STEPS[introStep].body}</p>
            <div className="intro-actions">
              <button
                onClick={() => setIntroStep((step) => Math.max(0, step - 1))}
                disabled={introStep === 0}
              >
                Back
              </button>
              <span>{introStep + 1} / {INTRO_STEPS.length}</span>
              <button className="primary-action" onClick={nextIntroStep} autoFocus>
                {introStep === INTRO_STEPS.length - 1 ? "Got it!" : "Next"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
