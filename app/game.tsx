"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const COLS = 24;
const ROWS = 14;
const CELL = 40;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const START = { x: 0, y: 6 };
const CITY = { x: 23, y: 7 };

type Point = { x: number; y: number };
type TowerKind = "thorn" | "frost" | "boulder" | "lightning";
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
  dead: boolean;
};

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
  hp: number;
  speed: number;
  bounty: number;
  unlock: number;
  cityDamage?: number;
};

type WaveAnnouncement = {
  wave: number;
  total: number;
  roster: { invader: Invader; count: number }[];
  earlyBonus: number;
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
  towersBuilt: number;
  bestWave: number;
  message: string;
  messageUntil: number;
  route: Point[];
  nextWaveIn: number;
  wavePeriod: number;
  waveAnnouncement: WaveAnnouncement | null;
};

const BLIGHTLINGS: Invader[] = [
  { name: "Muckling", file: "muckling.png", hp: 0.7, speed: 1, bounty: 4, unlock: 1 },
  { name: "Cinderling", file: "cinderling.png", hp: 0.52, speed: 1.42, bounty: 5, unlock: 1 },
  { name: "Scrapbug", file: "scrapbug.png", hp: 1.15, speed: 0.7, bounty: 8, unlock: 1 },
  { name: "Sporefiend", file: "sporefiend.png", hp: 0.95, speed: 0.92, bounty: 7, unlock: 2 },
  { name: "Smogbat", file: "smogbat.png", hp: 0.7, speed: 1.62, bounty: 7, unlock: 4, cityDamage: 2 },
];

const BOSS: Invader = {
  name: "The Grime King",
  file: "grime-king.png",
  hp: 10,
  speed: 0.62,
  bounty: 90,
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
    description: "Wolves chain bright spirit sparks",
    damage: 8,
    rate: 0.92,
    range: 2.85,
    hotkey: "4",
    guardian: "/assets/animals/TimberWolf.gif",
  },
};

const TOWER_ORDER = Object.keys(TOWER_DATA) as TowerKind[];
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
    body: "A wave arrives every 30 seconds. Space calls it early for bonus gold. Select a guardian and press M to move it, or press S between waves to sell it for a full refund.",
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
    towersBuilt: 0,
    bestWave: 0,
    message: "Grow a guardian maze before the Blight arrives.",
    messageUntil: 5,
    route: createPath(towers, rng, false) ?? [],
    nextWaveIn: 30,
    wavePeriod: 30,
    waveAnnouncement: null,
  };
}

function towerStats(tower: Tower) {
  const base = TOWER_DATA[tower.kind];
  return {
    damage: base.damage,
    rate: base.rate,
    range: base.range,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeWave(game: Game) {
  const wave = game.wave;
  const available = BLIGHTLINGS.filter((invader) => invader.unlock <= wave);
  const count = 8 + wave * 2;
  const queue: Invader[] = [];
  const roster = [...available].sort(() => game.rng() - 0.5);
  for (let i = 0; i < count; i += 1) {
    const mixedIndex = (i + Math.floor(game.rng() * roster.length)) % roster.length;
    queue.push(roster[mixedIndex]);
  }
  if (wave % 10 === 0) queue.splice(Math.floor(queue.length * 0.7), 0, BOSS);
  return queue;
}

function queueNextWave(game: Game, earlyBonus = 0) {
  game.wave += 1;
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
  game.gold += earlyBonus;
  game.rushGold += earlyBonus;
  game.goldEarned += earlyBonus;
  game.message = earlyBonus
    ? `Wave ${formatNumber(game.wave)} called early — +${formatNumber(earlyBonus)} gold!`
    : `Wave ${formatNumber(game.wave)}: ${formatNumber(wave.length)} Blightlings spilled from the rift.`;
  game.messageUntil = game.elapsed + 4;
  game.waveAnnouncement = {
    wave: game.wave,
    total: wave.length,
    roster: [...counts.values()],
    earlyBonus,
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
  const unlocked = BLIGHTLINGS.filter((invader) => invader.unlock <= next);
  const preview = unlocked.slice(0, 5);
  if (next % 10 === 0) preview.push(BOSS);
  return preview;
}

function invaderImagePath(invader: Invader) {
  return `/assets/blight/${invader.file}`;
}

export default function NatureDefenseGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createGame());
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const hoverRef = useRef<Point | null>(null);
  const selectedKindRef = useRef<TowerKind>("thorn");
  const selectedCellRef = useRef<Point | null>(null);
  const movingCellRef = useRef<Point | null>(null);
  const helpPausedRef = useRef(false);
  const introPausedRef = useRef(false);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [, setRevision] = useState(0);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("thorn");
  const [selectedCell, setSelectedCell] = useState<Point | null>(null);
  const [movingCell, setMovingCell] = useState<Point | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [introStep, setIntroStep] = useState(0);

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
    try {
      const previous = Number(localStorage.getItem("nature-defense-best") ?? 0);
      const best = Math.max(previous, wave);
      localStorage.setItem("nature-defense-best", String(best));
      game.bestWave = best;
    } catch {
      game.bestWave = Math.max(game.bestWave, wave);
    }
  }, []);

  useEffect(() => {
    try {
      gameRef.current.bestWave = Number(
        localStorage.getItem("nature-defense-best") ?? 0,
      );
      refresh();
    } catch {
      // Local storage is optional; the run remains fully playable without it.
    }
  }, [refresh]);

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
        game.gold += enemy.bounty;
        game.goldEarned += enemy.bounty;
      }
    },
    [],
  );

  const fireTower = useCallback(
    (game: Game, gridPoint: Point, tower: Tower) => {
      const stats = towerStats(tower);
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
        for (const enemy of game.enemies) {
          if (
            !enemy.dead &&
            distance(targetPoint, { x: enemy.x, y: enemy.y }) <=
              1.02 + tower.level * 0.12
          ) {
            damageEnemy(game, enemy, stats.damage, tower);
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
        const struck = new Set<number>();
        let current: Enemy | null = target;
        let chainFrom = from;
        const chains = 1 + tower.level;
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
            width: 3,
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
      } else {
        damageEnemy(game, target, stats.damage, tower);
        if (tower.kind === "frost") {
          target.slowFactor = Math.max(0.45, 0.72 - tower.level * 0.08);
          target.slowUntil = game.elapsed + 1.35 + tower.level * 0.35;
        }
        game.projectiles.push({
          from,
          to: targetPoint,
          color: base.color,
          age: 0,
          duration: 0.17,
          width: tower.kind === "frost" ? 4 : 2.5,
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

      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
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
          tower.cooldown = 1 / towerStats(tower).rate;
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
    [fireTower, refresh, spawnEnemy, syncBest],
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
      context.drawImage(riftImage, -8, entryY - 10, 62, 62);
    }

    const cityX = CITY.x * CELL;
    const cityY = CITY.y * CELL;
    const heartwoodImage = imagesRef.current.get("/assets/endpoints/heartwood.png");
    if (heartwoodImage?.complete) {
      context.drawImage(heartwoodImage, cityX - 12, cityY - 12, 64, 64);
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
    }

    const hover = hoverRef.current;
    if (hover && game.phase !== "gameover") {
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

    const selected = selectedCellRef.current;
    if (selected && game.towers.has(keyOf(selected.x, selected.y))) {
      const tower = game.towers.get(keyOf(selected.x, selected.y));
      if (tower) {
        const stats = towerStats(tower);
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

    const sortedEnemies = [...game.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sortedEnemies) {
      const image = imagesRef.current.get(invaderImagePath(enemy.invader));
      const drawX = enemy.x * CELL - 14;
      const bob = Math.sin(game.elapsed * 8 + enemy.id) * 1.2;
      const drawY = enemy.y * CELL - 14 + bob;
      if (enemy.slowUntil > game.elapsed) {
        context.fillStyle = "rgba(120, 225, 255, .32)";
        context.beginPath();
        context.arc(enemy.x * CELL, enemy.y * CELL, 16, 0, Math.PI * 2);
        context.fill();
      }
      if (image?.complete) context.drawImage(image, drawX, drawY, 28, 28);
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

  const selectTower = useCallback((kind: TowerKind) => {
    movingCellRef.current = null;
    setMovingCell(null);
    setSelectedKind(kind);
    setSelectedCell(null);
  }, []);

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
        setSelectedCell(point);
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
    [notify, refresh, selectedKind],
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
    if (game.phase === "gameover") return;
    const bonus = Math.max(1, Math.ceil(game.nextWaveIn));
    game.timeSaved += Math.max(0, game.nextWaveIn);
    game.wavesRushed += 1;
    queueNextWave(game, bonus);
    syncBest(game.wave);
    setSelectedCell(null);
    refresh();
  }, [refresh, syncBest]);

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
    setSelectedCell(null);
    setSelectedKind("thorn");
    lastTimeRef.current = 0;
    refresh();
  }, [refresh]);

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
      if (event.key >= "1" && event.key <= "4") {
        selectTower(TOWER_ORDER[Number(event.key) - 1]);
      } else if (event.code === "Space") {
        event.preventDefault();
        startWave();
      } else if (event.key.toLowerCase() === "p") {
        togglePause();
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
        else if (movingCellRef.current) cancelMove();
        else setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelMove, closeHelp, closeIntro, helpOpen, introOpen, moveSelected, nextIntroStep, openHelp, requestRestart, selectTower, sellSelected, setSpeed, startWave, togglePause]);

  const game = gameRef.current;
  const inspectedTower = selectedCell
    ? game.towers.get(keyOf(selectedCell.x, selectedCell.y))
    : undefined;
  const nextInvaders = useMemo(() => upcomingInvaders(game.wave), [game.wave]);
  const rushBonus = Math.max(1, Math.ceil(game.nextWaveIn));
  const waveAnnouncement =
    game.waveAnnouncement && game.waveAnnouncement.expiresAt > Date.now()
      ? game.waveAnnouncement
      : null;

  return (
    <main className="game-shell">
      <section className="game-surface">
        <div className="board-frame">
          <header className="hud-topbar">
            <div className="brand-lockup">
              <div className="brand-mark">ND</div>
              <div>
                <p className="eyebrow">Endless maze defense</p>
                <h1>Nature&apos;s Last Stand</h1>
              </div>
            </div>

            <div className="resource-bar" aria-label="Current run statistics">
              <div className="resource">
                <span>Gold</span>
                <strong className="gold-value">{formatNumber(game.gold)}</strong>
              </div>
              <div className="resource">
                <span>Heartwood</span>
                <strong className={game.health <= 5 ? "danger-value" : ""}>
                  {game.health}/20
                </strong>
              </div>
              <div className="resource">
                <span>Wave</span>
                <strong>{formatNumber(game.wave)}</strong>
              </div>
              <div className="resource desktop-stat">
                <span>Cleared</span>
                <strong>{formatNumber(game.kills)}</strong>
              </div>
              <div className="resource desktop-stat">
                <span>Cleansing</span>
                <strong>{formatNumber(game.damage)}</strong>
              </div>
            </div>

            <div className="hud-actions">
              <span className={`phase-pill ${game.phase}`}>
                {game.phase === "gameover"
                  ? "Heartwood wilted"
                  : game.paused
                    ? "Paused"
                    : game.phase === "intermission"
                      ? `Build window · ${Math.ceil(game.nextWaveIn)}s`
                      : `Next Blight · ${Math.ceil(game.nextWaveIn)}s`}
              </span>
              <button
                className="rush-button"
                onClick={startWave}
                disabled={game.phase === "gameover"}
              >
                Wave {formatNumber(game.wave + 1)} · +{formatNumber(rushBonus)} <kbd>Space</kbd>
              </button>
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
              <button
                className="help-button"
                onClick={openHelp}
                aria-label="Open game help"
              >
                ? <span>Help</span>
              </button>
              <button
                className="restart-button"
                onClick={requestRestart}
                aria-label="Restart the current run"
              >
                ↻ <span>Restart</span>
              </button>
            </div>
          </header>

          <div className="canvas-stage">
            <div className="game-message" aria-live="polite">
              <span>✦</span>
              {movingCell
                ? `Moving ${TOWER_DATA[selectedKind].name} — click open grass or press Esc to cancel.`
                : game.messageUntil > game.elapsed
                ? game.message
                : `${formatNumber(game.enemies.length + game.waveQueue.length)} Blightlings active · next wave in ${Math.ceil(game.nextWaveIn)}s`}
            </div>

            <div className="wave-peek" aria-label={`Upcoming wave ${game.wave + 1}`}>
              <span>Next · {formatNumber(8 + (game.wave + 1) * 2)}</span>
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

            <div className="board-playfield">
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                className={game.phase !== "gameover" ? "building" : ""}
                onClick={handleCanvasClick}
                onMouseMove={handlePointerMove}
                onMouseLeave={() => {
                  hoverRef.current = null;
                }}
                aria-label="24 by 14 tower defense game board"
              />

              {waveAnnouncement ? (
                <div
                  key={waveAnnouncement.wave}
                  className="wave-announcement"
                  role="status"
                  aria-live="assertive"
                >
                  <p>The rift stirs</p>
                  <h2>Wave {waveAnnouncement.wave}</h2>
                  <strong>{formatNumber(waveAnnouncement.total)} creatures incoming</strong>
                  <div className="wave-roster">
                    {waveAnnouncement.roster.map(({ invader, count }) => (
                      <span key={invader.name}>
                        <img src={invaderImagePath(invader)} alt="" />
                        <b>{formatNumber(count)}×</b> {invader.name}
                      </span>
                    ))}
                  </div>
                  {waveAnnouncement.earlyBonus > 0 ? (
                    <small>Early call bonus +{formatNumber(waveAnnouncement.earlyBonus)} gold</small>
                  ) : null}
                </div>
              ) : null}

              {selectedCell && inspectedTower && (
                <div
                  className={`tower-popover ${selectedCell.y < 3 ? "below" : ""}`}
                  style={{
                    left: `${((selectedCell.x + 0.5) / COLS) * 100}%`,
                    top: `${((selectedCell.y + 0.5) / ROWS) * 100}%`,
                  }}
                >
                  <strong>{TOWER_DATA[inspectedTower.kind].name}</strong>
                  <span>
                    {formatNumber(inspectedTower.kills)} cleared · {formatNumber(inspectedTower.damageDone)} cleansing
                  </span>
                  <span>
                    {Math.round(towerStats(inspectedTower).damage)} damage · {towerStats(inspectedTower).range.toFixed(1)} range
                  </span>
                  <div className="tower-actions">
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
                    <div className="game-over-sparks" aria-hidden="true">
                      <span>✦</span><span>◆</span><span>✿</span><span>✦</span>
                    </div>
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
                        <span>Battle time</span>
                        <strong>{formatDuration(game.realElapsed)}</strong>
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

                    <button className="primary-action" onClick={restart}>
                      Grow another last stand
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="guardian-dock" aria-label="Guardian build shortcuts">
              <span className="dock-label">Guardians</span>
              {TOWER_ORDER.map((kind) => {
                const tower = TOWER_DATA[kind];
                return (
                  <button
                    key={kind}
                    className={selectedKind === kind ? "selected" : ""}
                    onClick={() => selectTower(kind)}
                    disabled={game.phase === "gameover"}
                    aria-describedby={`tower-tooltip-${kind}`}
                    style={{ "--tower-color": tower.color } as React.CSSProperties}
                  >
                    <span className="dock-art">
                      <img src={tower.image} alt="" />
                      <img src={tower.guardian} alt="" />
                    </span>
                    <span>
                      <strong>{tower.hotkey}</strong>
                      <small>{tower.cost}</small>
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

            <div className="hotkey-strip" aria-label="Keyboard shortcuts">
              <span><kbd>1–4</kbd> Build</span>
              <span><kbd>S</kbd> Sell</span>
              <span><kbd>M</kbd> Move</span>
              <span><kbd>Space</kbd> Rush</span>
              <span><kbd>F</kbd> Speed</span>
              <span><kbd>P</kbd> Pause</span>
              <button onClick={openHelp}><kbd>H</kbd> All help</button>
            </div>
          </div>
        </div>
      </section>

      {helpOpen && (
        <div className="help-backdrop" role="presentation" onMouseDown={closeHelp}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="help-close"
              onClick={closeHelp}
              aria-label="Close help"
            >
              ×
            </button>
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
                  A mixed wave arrives every 30 seconds. Press Space to call it
                  early and earn the displayed gold bonus. Blightlings always
                  find a shortest open route.
                </p>
              </div>
              <div>
                <h3>Build under pressure</h3>
                <p>
                  You can plant or move guardians during any wave. Select one
                  and press M, then click its new patch. Between waves, press S
                  to sell it for a 100% refund.
                </p>
              </div>
              <div>
                <h3>Know the guardians</h3>
                <p>
                  Chickadees fire quickly, foxes slow, boars cleanse groups,
                  and wolves chain spirit sparks. Mix them along a long,
                  twisting route.
                </p>
              </div>
            </div>
            <div className="help-hotkeys">
              <span><kbd>1–4</kbd> Choose guardian</span>
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
        <div className={`intro-backdrop intro-${INTRO_STEPS[introStep].id}`}>
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
