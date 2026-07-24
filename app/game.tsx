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
  bestWave: number;
  message: string;
  messageUntil: number;
  route: Point[];
  nextWaveIn: number;
  wavePeriod: number;
};

const BLIGHTLINGS: Invader[] = [
  { name: "Muckling", file: "muckling.png", hp: 1, speed: 1, bounty: 4, unlock: 1 },
  { name: "Cinderling", file: "cinderling.png", hp: 0.72, speed: 1.48, bounty: 5, unlock: 1 },
  { name: "Scrapbug", file: "scrapbug.png", hp: 2.25, speed: 0.7, bounty: 8, unlock: 1 },
  { name: "Sporefiend", file: "sporefiend.png", hp: 1.45, speed: 0.92, bounty: 7, unlock: 2 },
  { name: "Smogbat", file: "smogbat.png", hp: 0.9, speed: 1.75, bounty: 7, unlock: 3, cityDamage: 2 },
];

const BOSS: Invader = {
  name: "The Grime King",
  file: "grime-king.png",
  hp: 15,
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
const keyOf = (x: number, y: number) => `${x},${y}`;

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
    gold: 260,
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
    bestWave: 0,
    message: "Grow a guardian maze before the Blight arrives.",
    messageUntil: 5,
    route: createPath(towers, rng, false) ?? [],
    nextWaveIn: 30,
    wavePeriod: 30,
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
  const count = 11 + wave * 3;
  const queue: Invader[] = [];
  const roster = [...available].sort(() => game.rng() - 0.5);
  for (let i = 0; i < count; i += 1) {
    const mixedIndex = (i + Math.floor(game.rng() * roster.length)) % roster.length;
    queue.push(roster[mixedIndex]);
  }
  if (wave % 5 === 0) queue.splice(Math.floor(queue.length * 0.65), 0, BOSS);
  return queue;
}

function queueNextWave(game: Game, earlyBonus = 0) {
  game.wave += 1;
  const wave = makeWave(game);
  game.waveQueue.push(...wave);
  game.spawnInterval = Math.max(0.2, 0.5 - game.wave * 0.007);
  game.spawnClock = Math.min(game.spawnClock, 0);
  game.nextWaveIn = game.wavePeriod;
  game.phase = "wave";
  game.paused = false;
  game.gold += earlyBonus;
  game.message = earlyBonus
    ? `Wave ${game.wave} called early — +${earlyBonus} gold!`
    : `Wave ${game.wave}: ${wave.length} Blightlings spilled from the rift.`;
  game.messageUntil = game.elapsed + 4;
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
  if (next % 5 === 0) preview.push(BOSS);
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
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [, setRevision] = useState(0);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("thorn");
  const [selectedCell, setSelectedCell] = useState<Point | null>(null);

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
    const allImages = [
      ...BLIGHTLINGS.map(invaderImagePath),
      invaderImagePath(BOSS),
      ...TOWER_ORDER.flatMap((kind) => [
        TOWER_DATA[kind].image,
        TOWER_DATA[kind].guardian,
      ]),
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
    const waveScale = Math.pow(1.2, game.wave - 1);
    const maxHp = 86 * waveScale * invader.hp;
    game.enemies.push({
      id: Math.floor(game.rng() * 0x7fffffff),
      invader,
      path,
      pathIndex: 0,
      x: path[0].x + 0.5,
      y: path[0].y + 0.5,
      hp: maxHp,
      maxHp,
      speed: (1.82 + Math.min(game.wave, 40) * 0.018) * invader.speed,
      bounty: Math.max(1, Math.round(invader.bounty * (1 + game.wave * 0.018))),
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
      const delta = Math.min(rawDelta, 0.05) * game.speed;
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
        game.phase = "intermission";
        game.message = "The grove is clear. Build and uproot before the next Blight.";
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
    context.fillStyle = "#593b75";
    context.fillRect(0, entryY + 5, 24, 30);
    context.fillStyle = "#9c68c6";
    context.fillRect(6, entryY + 12, 18, 16);
    context.fillStyle = "#f8cd62";
    context.fillRect(17, entryY + 17, 7, 6);

    const cityX = CITY.x * CELL;
    const cityY = CITY.y * CELL;
    context.fillStyle = "#715032";
    context.fillRect(cityX + 16, cityY + 18, 12, 22);
    context.fillStyle = "#b6e66a";
    for (const [dx, dy, radius] of [
      [9, 17, 11],
      [21, 10, 14],
      [33, 17, 11],
    ] as const) {
      context.beginPath();
      context.arc(cityX + dx, cityY + dy, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "#fff29a";
    context.fillRect(cityX + 19, cityY + 16, 6, 6);

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
    if (hover && game.phase === "intermission") {
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
      if (game.towers.has(key)) {
        setSelectedCell(point);
        return;
      }
      if (game.phase !== "intermission") {
        notify("Guardians can only be planted between waves.");
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
    notify(`Refunded ${tower.spent} gold.`);
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
    setSelectedCell(null);
    setSelectedKind("thorn");
    lastTimeRef.current = 0;
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key >= "1" && event.key <= "4") {
        selectTower(TOWER_ORDER[Number(event.key) - 1]);
      } else if (event.code === "Space") {
        event.preventDefault();
        startWave();
      } else if (event.key.toLowerCase() === "p") {
        togglePause();
      } else if (event.key.toLowerCase() === "s") {
        sellSelected();
      } else if (event.key.toLowerCase() === "f") {
        setSpeed(gameRef.current.speed === 1 ? 2 : 1);
      } else if (event.key.toLowerCase() === "n") {
        restart();
      } else if (event.key === "Escape") {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [restart, selectTower, sellSelected, setSpeed, startWave, togglePause]);

  const game = gameRef.current;
  const inspectedTower = selectedCell
    ? game.towers.get(keyOf(selectedCell.x, selectedCell.y))
    : undefined;
  const nextInvaders = useMemo(() => upcomingInvaders(game.wave), [game.wave]);
  const rushBonus = Math.max(1, Math.ceil(game.nextWaveIn));

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <div className="brand-mark">ND</div>
          <div>
            <p className="eyebrow">Whimsical endless maze defense</p>
            <h1>Nature&apos;s Last Stand</h1>
          </div>
        </div>
        <div className="resource-bar" aria-label="Current run statistics">
          <div className="resource">
            <span>Gold</span>
            <strong className="gold-value">{Math.floor(game.gold)}</strong>
          </div>
          <div className="resource">
            <span>Heartwood</span>
            <strong className={game.health <= 5 ? "danger-value" : ""}>
              {game.health}/20
            </strong>
          </div>
          <div className="resource">
            <span>Wave</span>
            <strong>{game.wave}</strong>
          </div>
          <div className="resource desktop-stat">
            <span>Best</span>
            <strong>{game.bestWave}</strong>
          </div>
        </div>
      </header>

      <section className="game-layout">
        <div className="board-column">
          <div className="board-frame">
            <div className="board-topline">
              <span className={`phase-pill ${game.phase}`}>
                {game.phase === "gameover"
                  ? "Heartwood wilted"
                  : game.paused
                    ? "Paused"
                    : game.phase === "intermission"
                      ? `Build window · ${Math.ceil(game.nextWaveIn)}s`
                      : `Next Blight · ${Math.ceil(game.nextWaveIn)}s`}
              </span>
              <span className="seed">Run #{game.seed.toString(16).toUpperCase()}</span>
            </div>
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onClick={handleCanvasClick}
              onMouseMove={handlePointerMove}
              onMouseLeave={() => {
                hoverRef.current = null;
              }}
              aria-label="24 by 14 tower defense game board"
            />
            {game.phase === "gameover" && (
              <div className="game-over">
                <p className="eyebrow">The Heartwood has wilted</p>
                <h2>Wave {game.wave}</h2>
                <p>
                  {game.kills} Blightlings cleared · {Math.round(game.damage)} cleansing
                </p>
                <button className="primary-action" onClick={restart}>
                  Start a new run
                </button>
              </div>
            )}
          </div>
          <div className="message-row" aria-live="polite">
            <span className="message-icon">✦</span>
            <span>
              {game.messageUntil > game.elapsed
                ? game.message
                : `${game.enemies.length + game.waveQueue.length} Blightlings active · next wave in ${Math.ceil(game.nextWaveIn)}s`}
            </span>
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
                disabled={game.phase === "gameover"}
                aria-label={game.paused ? "Resume" : "Pause"}
              >
                {game.paused ? "▶" : "Ⅱ"}
              </button>
            </div>
          </div>
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Grow defenses</p>
                <h2>Wild guardians</h2>
              </div>
              <span className="phase-note">
                {game.phase === "intermission" ? "Build open" : "Wave locked"}
              </span>
            </div>
            <div className="tower-list">
              {TOWER_ORDER.map((kind) => {
                const tower = TOWER_DATA[kind];
                const active = selectedKind === kind && !inspectedTower;
                return (
                  <button
                    key={kind}
                    className={`tower-card ${active ? "selected" : ""}`}
                    onClick={() => selectTower(kind)}
                    disabled={game.phase !== "intermission"}
                    style={{ "--tower-color": tower.color } as React.CSSProperties}
                  >
                    <span className="tower-art">
                      <img src={tower.image} alt="" />
                      <img src={tower.guardian} alt="" />
                    </span>
                    <span className="tower-copy">
                      <strong>{tower.name}</strong>
                      <small>{tower.description}</small>
                    </span>
                    <span className="tower-price">
                      <kbd>{tower.hotkey}</kbd>
                      {tower.cost}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {inspectedTower ? (
            <section className="panel-section inspector">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Selected defense</p>
                  <h2>{TOWER_DATA[inspectedTower.kind].name}</h2>
                </div>
                <span className="tier">Guardian</span>
              </div>
              <div className="inspector-body">
                <span className="inspector-art">
                  <img src={TOWER_DATA[inspectedTower.kind].image} alt="" />
                  <img src={TOWER_DATA[inspectedTower.kind].guardian} alt="" />
                </span>
                <dl>
                  <div>
                    <dt>Damage</dt>
                    <dd>{Math.round(towerStats(inspectedTower).damage)}</dd>
                  </div>
                  <div>
                    <dt>Range</dt>
                    <dd>{towerStats(inspectedTower).range.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Kills</dt>
                    <dd>{inspectedTower.kills}</dd>
                  </div>
                  <div>
                    <dt>Dealt</dt>
                    <dd>{Math.round(inspectedTower.damageDone)}</dd>
                  </div>
                </dl>
              </div>
              <div className="inspector-actions">
                <button
                  className="sell-button"
                  onClick={sellSelected}
                  disabled={game.phase !== "intermission"}
                >
                  Uproot · +{inspectedTower.spent} <kbd>S</kbd>
                </button>
              </div>
            </section>
          ) : (
            <section className="panel-section wave-preview">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Next mixed wave</p>
                  <h2>Wave {game.wave + 1}</h2>
                </div>
                <span>{11 + (game.wave + 1) * 3} total</span>
              </div>
              <div className="animal-preview">
                {nextInvaders.map((invader) => (
                  <div key={invader.name} title={invader.name}>
                    <img src={invaderImagePath(invader)} alt={invader.name} />
                  </div>
                ))}
              </div>
              <p>
                {game.wave + 1 > 1
                  ? "Every wave mixes unlocked Blightlings. Tougher breeds join quickly."
                  : "Mucklings, Cinderlings, and Scrapbugs all arrive together."}
              </p>
            </section>
          )}

          <button
            className="primary-action start-wave"
            onClick={startWave}
            disabled={game.phase === "gameover"}
          >
            {game.phase === "gameover"
              ? "Run ended"
              : `Call wave ${game.wave + 1} early · +${rushBonus}`}
            <span>Space</span>
          </button>
          <div className="run-metrics">
            <span>{game.kills} cleared</span>
            <span>{Math.round(game.damage)} cleansing</span>
            <button onClick={restart}>New run · N</button>
          </div>
        </aside>
      </section>

      <footer className="game-footer">
        <p>
          1–4 select guardians · click to build · S uproots with a 100% refund
          between waves.
        </p>
        <p>Space rushes a wave · F changes speed · P pauses · routes stay hidden.</p>
      </footer>
    </main>
  );
}
