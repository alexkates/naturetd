"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchLeaderboard,
  saveGameState,
  submitRun,
} from "@/app/actions";
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
  color: string;
  age: number;
  duration: number;
  width: number;
  arc?: boolean;
};

type Invader = {
  name: string;
  file: string;
  sprite: number;
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
  { name: "Muckling", file: "muckling.png", sprite: 0, hp: 0.7, speed: 1, bounty: 4, unlock: 1 },
  { name: "Cinderling", file: "cinderling.png", sprite: 1, hp: 0.52, speed: 1.42, bounty: 5, unlock: 1 },
  { name: "Scrapbug", file: "scrapbug.png", sprite: 2, hp: 1.15, speed: 0.7, bounty: 8, unlock: 1 },
  { name: "Sporefiend", file: "sporefiend.png", sprite: 3, hp: 0.95, speed: 0.92, bounty: 7, unlock: 2 },
  { name: "Smogbat", file: "smogbat.png", sprite: 4, hp: 0.7, speed: 1.62, bounty: 7, unlock: 4, cityDamage: 2 },
];

const BOSS: Invader = {
  name: "The Grime King",
  file: "grime-king.png",
  sprite: 5,
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
    image: string;
    color: string;
    tag: string;
    description: string;
    damage: number;
    rate: number;
    range: number;
    hotkey: string;
    guardian: string;
  }
> = {
  thorn: {
    name: "Chickadee Bramble",
    cost: 35,
    image: "/assets/towers/thorn.png",
    color: "#d9ef71",
    tag: "Single target · fast",
    description: "Chicks fling cleansing seeds",
    damage: 7,
    rate: 3.1,
    range: 2.35,
    hotkey: "1",
    guardian: "/assets/animals/TinyChick.gif",
  },
  frost: {
    name: "Foxglove Den",
    cost: 55,
    image: "/assets/towers/frost.png",
    color: "#8ee8ff",
    tag: "Single target · slow",
    description: "Snow foxes calm and slow",
    damage: 4,
    rate: 1.25,
    range: 2.8,
    hotkey: "2",
    guardian: "/assets/animals/SnowFox.gif",
  },
  boulder: {
    name: "Boarstone Burrow",
    cost: 65,
    image: "/assets/towers/boulder.png",
    color: "#f4b26b",
    tag: "Splash · heavy hit",
    description: "Boars scatter cleansing pollen",
    damage: 15,
    rate: 0.68,
    range: 3,
    hotkey: "3",
    guardian: "/assets/animals/MadBoar.gif",
  },
  lightning: {
    name: "Wolfwood Roost",
    cost: 85,
    image: "/assets/towers/lightning.png",
    color: "#ffe66a",
    tag: "Chain · multi-target",
    description: "Wolves chain bright spirit sparks",
    damage: 8,
    rate: 0.92,
    range: 2.85,
    hotkey: "4",
    guardian: "/assets/animals/TimberWolf.gif",
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
    body: "A wave arrives every 30 seconds. Space calls it early for bonus gold. Select a guardian and press U to upgrade or M to move it; press S between waves to sell it for a full refund.",
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
    health: 20,
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

function invaderImagePath(invader: Invader) {
  return `/assets/blight/${invader.file}`;
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
                  <img src={TOWER_DATA[tower.kind].image} alt="" />
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
              <span
                key={kind}
                style={{ "--buff-color": BUFF_DATA[kind].color } as React.CSSProperties}
                title={BUFF_DATA[kind].description}
              >
                <b>{BUFF_DATA[kind].icon}</b>
                {BUFF_DATA[kind].name}
                {rank > 1 ? ` ×${rank}` : ""}
              </span>
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

type GameProps = {
  displayName: string;
  email: string;
  savedGame: GameSaveState | null;
  initialLeaderboard: LeaderboardRun[];
  bestWave: number;
};

export default function NatureDefenseGame({
  displayName,
  email,
  savedGame,
  initialLeaderboard,
  bestWave,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);
  const guardianDockRef = useRef<HTMLDivElement>(null);
  const hudActionsRef = useRef<HTMLDivElement>(null);
  // Built on the first render only, so restoring a save never re-runs pathfinding.
  const gameRef = useRef<Game>(null as unknown as Game);
  if (!gameRef.current) {
    const initial = savedGame ? restoreGame(savedGame) : createGame();
    initial.bestWave = Math.max(bestWave, initial.bestWave);
    gameRef.current = initial;
  }
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const hoverRef = useRef<Point | null>(null);
  const selectedKindRef = useRef<TowerKind>("thorn");
  const selectedSpellRef = useRef<SpellKind | null>(null);
  const selectedCellRef = useRef<Point | null>(null);
  const movingCellRef = useRef<Point | null>(null);
  const helpPausedRef = useRef(false);
  const introPausedRef = useRef(false);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [, setRevision] = useState(0);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("thorn");
  const [selectedSpell, setSelectedSpell] = useState<SpellKind | null>(null);
  const [selectedCell, setSelectedCell] = useState<Point | null>(null);
  const [movingCell, setMovingCell] = useState<Point | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
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

  useEffect(() => {
    selectedKindRef.current = selectedKind;
  }, [selectedKind]);

  useEffect(() => {
    selectedSpellRef.current = selectedSpell;
  }, [selectedSpell]);

  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  useEffect(() => {
    movingCellRef.current = movingCell;
  }, [movingCell]);

  useEffect(() => {
    const allImages = [
      ...BLIGHTLINGS.map(invaderImagePath),
      invaderImagePath(BOSS),
      ...TOWER_ORDER.flatMap((kind) => [
        TOWER_DATA[kind].image,
        TOWER_DATA[kind].guardian,
      ]),
      "/assets/blight-sprites/blight-atlas-v6.png",
      "/assets/endpoints/blight-rift.png",
      "/assets/endpoints/heartwood.png",
    ];
    for (const source of allImages) {
      const image = new Image();
      image.src = source;
      imagesRef.current.set(source, image);
    }
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
      const base = TOWER_DATA[tower.kind];
      if (tower.kind === "boulder") {
        const radius =
          1.02 +
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
          color: base.color,
          age: 0,
          duration: 0.22,
          width: 5,
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
              color: base.color,
              age: 0,
              duration: 0.14,
              width: cast === 0 ? 3 : 5,
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
          color: base.color,
          age: 0,
          duration: 0.17,
          width: 4,
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
          color: base.color,
          age: 0,
          duration: 0.17,
          width: hits === 3 ? 5 : 2.5,
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
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.imageSmoothingEnabled = false;

    context.fillStyle = "#466c36";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? "#507a3c" : "#4b7438";
        context.fillRect(x * CELL, y * CELL, CELL, CELL);
        if ((x * 17 + y * 29) % 11 === 0) {
          context.fillStyle = "#6f984e";
          context.fillRect(x * CELL + 8, y * CELL + 10, 3, 6);
          context.fillRect(x * CELL + 13, y * CELL + 14, 3, 4);
        }
      }
    }

    context.strokeStyle = "rgba(23, 49, 27, .2)";
    context.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) {
      context.beginPath();
      context.moveTo(x * CELL + 0.5, 0);
      context.lineTo(x * CELL + 0.5, HEIGHT);
      context.stroke();
    }
    for (let y = 0; y <= ROWS; y += 1) {
      context.beginPath();
      context.moveTo(0, y * CELL + 0.5);
      context.lineTo(WIDTH, y * CELL + 0.5);
      context.stroke();
    }

    const entryY = START.y * CELL;
    const riftImage = imagesRef.current.get("/assets/endpoints/blight-rift.png");
    if (riftImage?.complete) {
      context.drawImage(riftImage, START.x * CELL, entryY, CELL, CELL);
    }

    const cityX = CITY.x * CELL;
    const cityY = CITY.y * CELL;
    const heartwoodImage = imagesRef.current.get("/assets/endpoints/heartwood.png");
    if (heartwoodImage?.complete) {
      context.drawImage(heartwoodImage, cityX, cityY, CELL, CELL);
    }

    for (const [key, tower] of game.towers) {
      const [x, y] = key.split(",").map(Number);
      const image = imagesRef.current.get(TOWER_DATA[tower.kind].image);
      if (image?.complete) {
        context.drawImage(image, x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      }
      const guardian = imagesRef.current.get(TOWER_DATA[tower.kind].guardian);
      if (guardian?.complete) {
        context.drawImage(guardian, x * CELL + 17, y * CELL + 13, 22, 22);
      }
      context.fillStyle = TOWER_DATA[tower.kind].color;
      for (let level = 0; level < tower.level; level += 1) {
        context.beginPath();
        context.arc(x * CELL + 6 + level * 7, y * CELL + 35, 2.2, 0, Math.PI * 2);
        context.fill();
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
      } else {
        const occupied = game.towers.has(keyOf(hover.x, hover.y));
        const forbidden =
          (hover.x === START.x && hover.y === START.y) ||
          (hover.x === CITY.x && hover.y === CITY.y);
        const affordable =
          movingCellRef.current !== null ||
          game.gold >= TOWER_DATA[selectedKindRef.current].cost;
        context.fillStyle =
          occupied || forbidden || !affordable
            ? "rgba(244, 87, 80, .35)"
            : "rgba(226, 245, 132, .27)";
        context.fillRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
        if (!occupied) {
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
          const ghost = imagesRef.current.get(selectedTower.image);
          context.globalAlpha = 0.72;
          if (ghost?.complete) {
            context.drawImage(
              ghost,
              hover.x * CELL + 1,
              hover.y * CELL + 1,
              CELL - 2,
              CELL - 2,
            );
          }
          const guardian = imagesRef.current.get(selectedTower.guardian);
          if (guardian?.complete) {
            context.drawImage(
              guardian,
              hover.x * CELL + 17,
              hover.y * CELL + 13,
              22,
              22,
            );
          }
          context.globalAlpha = 1;
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
      const atlas = imagesRef.current.get("/assets/blight-sprites/blight-atlas-v6.png");
      const fallback = imagesRef.current.get(invaderImagePath(enemy.invader));
      const next = enemy.path[enemy.pathIndex + 1];
      const dx = next ? next.x + 0.5 - enemy.x : 1;
      const dy = next ? next.y + 0.5 - enemy.y : 0;
      const direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
      const frame = Math.abs(Math.floor(game.elapsed * 5 + enemy.id)) % 3;
      const spriteSize = enemy.invader === BOSS ? 40 : 34;
      const drawX = enemy.x * CELL - spriteSize / 2;
      const bob = Math.sin(game.elapsed * 7 + enemy.id) * 0.65;
      const drawY = enemy.y * CELL - spriteSize / 2 + bob;
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
      if (atlas?.complete) {
        const sourceWidth = atlas.naturalWidth / 18;
        const sourceHeight = atlas.naturalHeight / 4;
        context.drawImage(
          atlas,
          (enemy.invader.sprite * 3 + frame) * sourceWidth,
          direction * sourceHeight,
          sourceWidth,
          sourceHeight,
          drawX,
          drawY,
          spriteSize,
          spriteSize,
        );
      } else if (fallback?.complete) {
        context.drawImage(fallback, drawX, drawY, spriteSize, spriteSize);
      }
      context.fillStyle = "#17251a";
      context.fillRect(enemy.x * CELL - 13, enemy.y * CELL - 20, 26, 4);
      context.fillStyle =
        enemy.hp / enemy.maxHp > 0.45 ? "#d9ef71" : "#f47a62";
      context.fillRect(
        enemy.x * CELL - 13,
        enemy.y * CELL - 20,
        26 * Math.max(0, enemy.hp / enemy.maxHp),
        4,
      );
    }

    for (const projectile of game.projectiles) {
      const progress = projectile.age / projectile.duration;
      const from = { x: projectile.from.x * CELL, y: projectile.from.y * CELL };
      const to = { x: projectile.to.x * CELL, y: projectile.to.y * CELL };
      context.globalAlpha = Math.max(0, 1 - progress);
      context.strokeStyle = projectile.color;
      context.lineWidth = projectile.width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      if (projectile.arc) {
        context.quadraticCurveTo(
          (from.x + to.x) / 2,
          Math.min(from.y, to.y) - 34,
          to.x,
          to.y,
        );
      } else {
        context.lineTo(to.x, to.y);
      }
      context.stroke();
      context.globalAlpha = 1;
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
    movingCellRef.current = null;
    setMovingCell(null);
    setSelectedKind(kind);
    setSelectedCell(null);
  }, [cancelSpell]);

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
      movingCellRef.current = null;
      selectedSpellRef.current = kind;
      setMovingCell(null);
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
        game.health = Math.min(20, game.health + 3 + mercyRank * 2);
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
      const movingFrom = movingCellRef.current;
      if (movingFrom) {
        const sourceKey = keyOf(movingFrom.x, movingFrom.y);
        if (key === sourceKey) {
          movingCellRef.current = null;
          setMovingCell(null);
          setSelectedCell(movingFrom);
          notify("Move cancelled.");
          return;
        }
        if (game.towers.has(key)) {
          notify("That patch already has a guardian.");
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
              Math.floor(enemy.x) === point.x &&
              Math.floor(enemy.y) === point.y,
          )
        ) {
          notify("A Blightling is already skittering through that patch.");
          return;
        }
        const tower = game.towers.get(sourceKey);
        if (!tower) {
          movingCellRef.current = null;
          setMovingCell(null);
          return;
        }
        game.towers.delete(sourceKey);
        game.towers.set(key, tower);
        const route = createPath(game.towers, game.rng, false);
        if (!route) {
          game.towers.delete(key);
          game.towers.set(sourceKey, tower);
          notify("That move blocks the last route to the Heartwood.");
          return;
        }
        game.route = route;
        rerouteEnemies(game);
        movingCellRef.current = null;
        setMovingCell(null);
        setSelectedCell(point);
        game.message = `${TOWER_DATA[tower.kind].name} moved.`;
        game.messageUntil = game.elapsed + 2;
        refresh();
        return;
      }
      if (game.towers.has(key)) {
        setSelectedCell((current) =>
          current && current.x === point.x && current.y === point.y ? null : point,
        );
        return;
      }
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
      hoverRef.current = {
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
    if (!cell || game.phase !== "intermission") return;
    const key = keyOf(cell.x, cell.y);
    const tower = game.towers.get(key);
    if (!tower) return;
    game.gold += tower.spent;
    game.towers.delete(key);
    game.route = createPath(game.towers, game.rng, false) ?? [];
    rerouteEnemies(game);
    setSelectedCell(null);
    notify(`${TOWER_DATA[tower.kind].name} sold for ${formatNumber(tower.spent)} gold.`);
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

  const moveSelected = useCallback(() => {
    const game = gameRef.current;
    const cell = selectedCellRef.current;
    if (!cell || game.phase === "gameover") {
      notify("Select a guardian to move first.");
      return;
    }
    const tower = game.towers.get(keyOf(cell.x, cell.y));
    if (!tower) return;
    movingCellRef.current = cell;
    selectedKindRef.current = tower.kind;
    setMovingCell(cell);
    setSelectedKind(tower.kind);
    setSelectedCell(null);
    refresh();
  }, [notify, refresh]);

  const cancelMove = useCallback(() => {
    const cell = movingCellRef.current;
    if (!cell) return;
    movingCellRef.current = null;
    setMovingCell(null);
    setSelectedCell(cell);
    notify("Move cancelled.");
  }, [notify]);

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
    movingCellRef.current = null;
    setMovingCell(null);
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
    if (seen) return;
    const game = gameRef.current;
    introPausedRef.current = game.paused;
    game.paused = true;
    setIntroStep(0);
    setIntroOpen(true);
    refresh();
  }, [refresh]);

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
      } else if (event.key.toLowerCase() === "m") {
        if (movingCellRef.current) cancelMove();
        else moveSelected();
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
        else if (movingCellRef.current) cancelMove();
        else setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelMove, cancelSpell, closeHelp, closeIntro, helpOpen, introOpen, moveSelected, nextIntroStep, openHelp, requestRestart, selectSpell, selectTower, sellSelected, setSpeed, startWave, togglePause, upgradeSelected]);

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
    : movingCell
      ? `Moving ${TOWER_DATA[selectedKind].name} — click open grass or press Esc to cancel.`
      : game.messageUntil > game.elapsed
        ? game.message
        : null;

  return (
    <main className="game-shell">
      <section className="game-surface">
        <div className="board-frame">
          <header className="hud-topbar">
            <div className="brand-lockup">
              <div className="brand-mark">ND</div>
              <h1>Nature&apos;s Last Stand</h1>
            </div>

            <div className="resource-bar" aria-label="Current run statistics">
              <div className="resource">
                <span>Gold</span>
                <strong className="gold-value">{formatNumber(game.gold)}</strong>
              </div>
              <div className="resource" ref={healthRef}>
                <span>Heartwood</span>
                <strong className={game.health <= 5 ? "danger-value" : ""}>
                  {game.health}/20
                </strong>
              </div>
              <div className="resource">
                <span>Wave</span>
                <strong>{formatNumber(game.wave)}</strong>
              </div>
            </div>

            <div ref={hudActionsRef} className="hud-actions">
              <span className={`phase-pill ${game.phase}`}>
                {game.phase === "gameover"
                  ? "Wilted"
                  : game.paused
                    ? "Paused"
                    : game.phase === "intermission"
                      ? `Build · ${Math.ceil(game.nextWaveIn)}s`
                      : `Blight · ${Math.ceil(game.nextWaveIn)}s`}
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
                {rushWindow > 0 ? `Chain ×${nextRushStreak}` : `Wave ${formatNumber(game.wave + 1)}`}
                {" "}· +{formatNumber(rushBonus)} <kbd>Space</kbd>
                </button>
              </div>
              <div className="speed-controls">
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
              </div>
              <div className="utility-controls">
                <button
                  className="help-button"
                  onClick={openHelp}
                  aria-label="Open game help"
                  title="Help (H)"
                >
                  ?
                </button>
                <button
                  className="leaderboard-button"
                  onClick={openLeaderboard}
                  aria-label="Open leaderboard"
                  title="Top 10 runs"
                >
                  ♛
                </button>
                <button
                  className="restart-button"
                  onClick={requestRestart}
                  aria-label="Restart the current run"
                  title="New run (N)"
                >
                  ↻
                </button>
              </div>
              <div className="account-controls">
                <a
                  className="account-chip"
                  href="/profile"
                  title={`Signed in as ${email}`}
                >
                  <span aria-hidden="true">✿</span>
                  <strong>{displayName}</strong>
                </a>
                {saveError ? (
                  <span className="save-status error" aria-live="polite">
                    Save failed
                  </span>
                ) : null}
              </div>
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
                  <img
                    key={invader.name}
                    src={invaderImagePath(invader)}
                    alt={invader.name}
                    title={invader.name}
                  />
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
                      : "building"
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
                        <img src={invaderImagePath(invader)} alt="" />
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
                    <button onClick={moveSelected}>
                      Move <kbd>M</kbd>
                    </button>
                    <button
                      onClick={sellSelected}
                      disabled={game.phase !== "intermission"}
                    >
                      Sell +{formatNumber(inspectedTower.spent)} <kbd>S</kbd>
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
                    className={selectedKind === kind ? "selected" : ""}
                    onClick={() => selectTower(kind)}
                    disabled={game.phase === "gameover" || Boolean(game.pendingBuffChoices)}
                    aria-describedby={`tower-tooltip-${kind}`}
                    style={{ "--tower-color": tower.color } as React.CSSProperties}
                  >
                    <span className="dock-art">
                      <img src={tower.image} alt="" />
                      <img src={tower.guardian} alt="" />
                    </span>
                    <span className="dock-copy">
                      <strong>{tower.name}</strong>
                      <em>{tower.tag}</em>
                      <small><kbd>{tower.hotkey}</kbd> · {tower.cost} gold</small>
                    </span>
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
                    <span className="spell-icon" aria-hidden="true">{spell.icon}</span>
                    <span className="spell-copy">
                      <strong>{spell.name}</strong>
                      <em>{spell.tag}</em>
                      <small>
                        <kbd>{spell.hotkey}</kbd>
                        {charges ? `${charges} ready` : `${formatNumber(cost)} gold`}
                      </small>
                    </span>
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
              {game.buffs.length ? (
                <aside className="buff-build" aria-label="Current Grove Blessings">
                  <strong>Grove build</strong>
                  <div>
                    {BUFF_ORDER.filter((kind) => buffRank(game, kind) > 0).map((kind) => {
                      const rank = buffRank(game, kind);
                      return (
                        <article
                          key={kind}
                          className="grove-card"
                          tabIndex={0}
                          style={{ "--buff-color": BUFF_DATA[kind].color } as React.CSSProperties}
                          title={`${BUFF_DATA[kind].family} · ${BUFF_DATA[kind].description}`}
                          aria-label={BUFF_DATA[kind].name + (rank > 1 ? ` rank ${rank}` : "") + ". " + BUFF_DATA[kind].description}
                        >
                          <b className="grove-card-icon" aria-hidden="true">
                            {BUFF_DATA[kind].icon}
                          </b>
                          <strong>
                            {BUFF_DATA[kind].name}
                            {rank > 1 ? <em> ×{rank}</em> : null}
                          </strong>
                        </article>
                      );
                    })}
                  </div>
                </aside>
              ) : null}
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
                  You can plant, move, or upgrade guardians during any wave.
                  Select one and press U to reach level 5, or press M and click
                  its new patch. Between waves, press S for a 100% refund.
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
              <span><kbd>M</kbd> Move selected</span>
              <span><kbd>Space</kbd> Call wave</span>
              <span><kbd>F</kbd> Toggle speed</span>
              <span><kbd>P</kbd> Pause</span>
              <span><kbd>N</kbd> New run</span>
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
                {introStep === INTRO_STEPS.length - 1 ? "Defend the grove" : "Next"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
