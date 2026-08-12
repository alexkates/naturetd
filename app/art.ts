import type { TowerKind } from "@/lib/types";

/**
 * Procedural vector art for everything on the board.
 *
 * The board used to be drawn from dark, high-detail pixel-art PNGs (a 16px
 * guardian GIF upscaled to 22px, a 34px blight atlas) which read as muddy and
 * clashed with the pastel UI. Everything here is drawn from circles, rounded
 * rects and quadratic curves instead, so it stays crisp at any board size and
 * shares the UI palette.
 *
 * House style, so additions stay coherent:
 * - flat fills, one soft-plum ink outline, round caps and joins
 * - two tones per form: base plus one darker underside wedge
 * - eyes are ink dots with a single cream highlight — never more detail
 * - motion is sine bob and squash/stretch, never frame-flipping
 *
 * Every `draw*` function paints into a 100x100 design box centred on the
 * origin, so callers do `translate` + `scale(size / 100)` and forget about
 * pixel sizes. `t` is elapsed seconds, `phase` de-syncs instances.
 */

type Ctx = CanvasRenderingContext2D;

export const INK = "#3d3050";
const CREAM = "#fff6e2";

export type BlightKind =
  | "muckling"
  | "cinderling"
  | "scrapbug"
  | "sporefiend"
  | "smogbat"
  | "grimeKing";

const BLIGHT_PALETTE: Record<BlightKind, { body: string; shade: string; accent: string }> = {
  muckling: { body: "#a58cd0", shade: "#7f66ad", accent: "#d8c9f2" },
  cinderling: { body: "#f79b6f", shade: "#d56f4a", accent: "#ffd9a8" },
  scrapbug: { body: "#7fa6b4", shade: "#5b8391", accent: "#c2e0e8" },
  sporefiend: { body: "#cf95d6", shade: "#a86cb2", accent: "#f3d7f5" },
  smogbat: { body: "#8f86ab", shade: "#6c6389", accent: "#cfc8e4" },
  grimeKing: { body: "#8d75c4", shade: "#63509a", accent: "#ffd76a" },
};

const NEST_PALETTE: Record<
  TowerKind,
  { base: string; shade: string; accent: string; bloom: string }
> = {
  thorn: { base: "#b98c5f", shade: "#94693f", accent: "#b9e769", bloom: "#fff3b0" },
  frost: { base: "#9bd8ef", shade: "#6cb6d6", accent: "#e8f8ff", bloom: "#8ee8ff" },
  boulder: { base: "#c3bcd2", shade: "#9c93b3", accent: "#a8cf7d", bloom: "#efe9f7" },
  lightning: { base: "#a8845f", shade: "#836444", accent: "#ffe08a", bloom: "#ffe66a" },
};

function ink(ctx: Ctx, width = 4) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

function shape(ctx: Ctx, fill: string, width = 4) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ink(ctx, width);
    ctx.stroke();
  }
}

function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

/** Darker wedge along the lower-right of a form — the only shading we use. */
function underside(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, tone: string) {
  ctx.save();
  ellipse(ctx, cx, cy, rx, ry);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.42, cy + ry * 0.46, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone;
  ctx.fill();
  ctx.restore();
}

/** Two ink eyes with a cream catchlight. `open` squints them for blinks. */
function eyes(ctx: Ctx, cx: number, cy: number, spread: number, r: number, open = 1) {
  for (const side of [-1, 1]) {
    const x = cx + side * spread;
    if (open > 0.35) {
      ellipse(ctx, x, cy, r, r * open);
      ctx.fillStyle = INK;
      ctx.fill();
      ellipse(ctx, x - r * 0.3, cy - r * 0.34 * open, r * 0.32, r * 0.32 * open);
      ctx.fillStyle = CREAM;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - r, cy);
      ctx.quadraticCurveTo(x, cy + r * 0.7, x + r, cy);
      ink(ctx, r * 0.8);
      ctx.stroke();
    }
  }
}

/** Small rounded blush cheeks — the main "whimsical" tell. */
function cheeks(ctx: Ctx, cx: number, cy: number, spread: number, r: number, tone: string) {
  ctx.globalAlpha = 0.5;
  for (const side of [-1, 1]) {
    ellipse(ctx, cx + side * spread, cy, r, r * 0.68);
    ctx.fillStyle = tone;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function blink(t: number, phase: number) {
  const cycle = (t * 0.55 + phase) % 1;
  return cycle > 0.96 ? 0.15 : 1;
}

// ---------------------------------------------------------------------------
// Blightlings
// ---------------------------------------------------------------------------

/**
 * `facing` is -1 when walking left. Squash/stretch comes from `t`; `phase`
 * keeps a crowd from moving in lockstep.
 */
export function drawBlightling(
  ctx: Ctx,
  kind: BlightKind,
  t: number,
  phase: number,
  facing: number,
) {
  const skin = BLIGHT_PALETTE[kind];
  const squash = 1 + Math.sin(t * 6.5 + phase) * 0.06;
  ctx.save();
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // Contact shadow keeps everyone planted on the grass.
  ctx.globalAlpha = 0.16;
  ellipse(ctx, 0, 40, 26 / squash, 6);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.scale(1 / squash, squash);
  if (kind === "muckling") drawMuckling(ctx, skin, t, phase);
  else if (kind === "cinderling") drawCinderling(ctx, skin, t, phase);
  else if (kind === "scrapbug") drawScrapbug(ctx, skin, t, phase);
  else if (kind === "sporefiend") drawSporefiend(ctx, skin, t, phase);
  else if (kind === "smogbat") drawSmogbat(ctx, skin, t, phase);
  else drawGrimeKing(ctx, skin, t, phase);
  ctx.restore();
}

type Skin = { body: string; shade: string; accent: string };

/** Dumpling blob with a drippy hem and a hopeful little sprout. */
function drawMuckling(ctx: Ctx, skin: Skin, t: number, phase: number) {
  ctx.beginPath();
  ctx.moveTo(-30, 14);
  ctx.quadraticCurveTo(-32, -30, 0, -32);
  ctx.quadraticCurveTo(32, -30, 30, 14);
  // Three drips along the bottom edge, wobbling out of sync.
  for (let i = 0; i < 3; i += 1) {
    const x = 20 - i * 20;
    const drop = 10 + Math.sin(t * 3.2 + phase + i) * 3;
    ctx.quadraticCurveTo(x + 5, 20 + drop, x, 20 + drop);
    ctx.quadraticCurveTo(x - 5, 20 + drop, x - 10, 16);
  }
  ctx.closePath();
  shape(ctx, skin.body);
  underside(ctx, 0, -4, 30, 30, skin.shade);

  ctx.beginPath();
  ctx.moveTo(2, -32);
  ctx.quadraticCurveTo(4, -46, 14, -48);
  ink(ctx, 4);
  ctx.stroke();
  ellipse(ctx, 15, -49, 7, 5);
  shape(ctx, "#b9e769", 3.4);

  cheeks(ctx, 0, 2, 19, 7, skin.shade);
  eyes(ctx, 0, -8, 11, 5.6, blink(t, phase));
}

/** Teardrop flame; the tip leans back and forth. */
function drawCinderling(ctx: Ctx, skin: Skin, t: number, phase: number) {
  const lean = Math.sin(t * 4.4 + phase) * 9;
  ctx.beginPath();
  ctx.moveTo(-26, 18);
  ctx.quadraticCurveTo(-30, -18, lean - 4, -46);
  ctx.quadraticCurveTo(lean + 16, -20, 26, 18);
  ctx.quadraticCurveTo(0, 30, -26, 18);
  ctx.closePath();
  shape(ctx, skin.body);
  underside(ctx, 0, 2, 26, 24, skin.shade);

  // Inner flame, leaning the other way so the two read as separate layers.
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.quadraticCurveTo(-13, 6, -8, -8);
  ctx.quadraticCurveTo(-4, -20, lean * 0.4, -24);
  ctx.quadraticCurveTo(6, -14, 9, -4);
  ctx.quadraticCurveTo(13, 8, 0, 20);
  ctx.closePath();
  ctx.fillStyle = skin.accent;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;

  eyes(ctx, 0, 2, 10, 5.2, blink(t, phase));
}

/** Low wide beetle: hard shell, stubby legs, curious antennae. */
function drawScrapbug(ctx: Ctx, skin: Skin, t: number, phase: number) {
  ink(ctx, 4);
  for (let i = 0; i < 3; i += 1) {
    const x = -16 + i * 16;
    const kick = Math.sin(t * 9 + phase + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x - 4, 26 + kick * 0.2);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 12, -22);
    ctx.quadraticCurveTo(side * 26, -40, side * 20 + Math.sin(t * 5 + phase) * 3, -46);
    ink(ctx, 3.4);
    ctx.stroke();
  }

  ellipse(ctx, 0, 0, 34, 24);
  shape(ctx, skin.body);
  underside(ctx, 0, 0, 34, 24, skin.shade);

  // Shell seam plus two plates.
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.lineTo(0, 22);
  ink(ctx, 3.4);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 17, -4, 7, 5);
    ctx.fillStyle = skin.accent;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  eyes(ctx, 0, 4, 12, 5.4, blink(t, phase));
}

/** Mushroom cap over a stubby stalk, trailing spores. */
function drawSporefiend(ctx: Ctx, skin: Skin, t: number, phase: number) {
  for (let i = 0; i < 3; i += 1) {
    const drift = (t * 0.9 + phase + i * 0.33) % 1;
    ellipse(ctx, -18 + i * 17, -44 - drift * 22, 4.5 * (1 - drift), 4.5 * (1 - drift));
    ctx.fillStyle = skin.accent;
    ctx.globalAlpha = 0.75 * (1 - drift);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.moveTo(-15, 24);
  ctx.quadraticCurveTo(-19, -6, -13, -14);
  ctx.lineTo(13, -14);
  ctx.quadraticCurveTo(19, -6, 15, 24);
  ctx.closePath();
  shape(ctx, CREAM);

  ctx.beginPath();
  ctx.moveTo(-34, -14);
  ctx.quadraticCurveTo(-32, -46, 0, -46);
  ctx.quadraticCurveTo(32, -46, 34, -14);
  ctx.quadraticCurveTo(0, -6, -34, -14);
  ctx.closePath();
  shape(ctx, skin.body);
  underside(ctx, 0, -26, 34, 22, skin.shade);

  for (const [dx, dy, r] of [
    [-18, -28, 5],
    [4, -34, 6.5],
    [21, -25, 4.5],
  ]) {
    ellipse(ctx, dx, dy, r, r * 0.8);
    ctx.fillStyle = skin.accent;
    ctx.fill();
  }

  cheeks(ctx, 0, 12, 11, 5, skin.shade);
  eyes(ctx, 0, 4, 7.5, 4.6, blink(t, phase));
}

/** Round body slung between two big scalloped wings. */
function drawSmogbat(ctx: Ctx, skin: Skin, t: number, phase: number) {
  const flap = Math.sin(t * 11 + phase);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 14, -6);
    ctx.rotate(side * flap * 0.42);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 26, -22, side * 44, -8);
    ctx.quadraticCurveTo(side * 34, -2, side * 38, 10);
    ctx.quadraticCurveTo(side * 26, 4, side * 22, 14);
    ctx.quadraticCurveTo(side * 12, 8, 0, 12);
    ctx.closePath();
    shape(ctx, side * flap > 0 ? skin.shade : skin.body, 3.6);
    ctx.restore();
  }

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 9, -22);
    ctx.lineTo(side * 15, -38);
    ctx.lineTo(side * 20, -20);
    ctx.closePath();
    shape(ctx, skin.body, 3.4);
  }

  ellipse(ctx, 0, -2, 22, 20);
  shape(ctx, skin.body);
  underside(ctx, 0, -2, 22, 20, skin.shade);

  cheeks(ctx, 0, 6, 13, 6, skin.shade);
  eyes(ctx, 0, -4, 9, 5.4, blink(t, phase));

  ellipse(ctx, 0, 8, 4, 3);
  ctx.fillStyle = INK;
  ctx.fill();
}

/** The boss: a bigger, heavier-browed blob under a gold crown. */
function drawGrimeKing(ctx: Ctx, skin: Skin, t: number, phase: number) {
  ctx.beginPath();
  ctx.moveTo(-38, 20);
  ctx.quadraticCurveTo(-42, -32, 0, -34);
  ctx.quadraticCurveTo(42, -32, 38, 20);
  ctx.quadraticCurveTo(0, 34, -38, 20);
  ctx.closePath();
  shape(ctx, skin.body, 4.6);
  underside(ctx, 0, -4, 38, 32, skin.shade);

  ctx.beginPath();
  ctx.moveTo(-24, -32);
  ctx.lineTo(-18, -50);
  ctx.lineTo(-8, -38);
  ctx.lineTo(0, -56);
  ctx.lineTo(8, -38);
  ctx.lineTo(18, -50);
  ctx.lineTo(24, -32);
  ctx.closePath();
  shape(ctx, skin.accent, 4.2);

  // Heavy brow — the one place a blightling gets an expression beyond eyes.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -18);
    ctx.lineTo(side * 24, -12);
    ink(ctx, 4.6);
    ctx.stroke();
  }
  eyes(ctx, 0, -2, 14, 6.4, blink(t, phase));

  ctx.beginPath();
  ctx.moveTo(-12, 14);
  ctx.quadraticCurveTo(0, 8, 12, 14);
  ink(ctx, 4);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Towers: a nest, plus the guardian sitting in it
// ---------------------------------------------------------------------------

export function drawNest(
  ctx: Ctx,
  kind: TowerKind,
  t: number,
  phase: number,
  level = 1,
) {
  const skin = NEST_PALETTE[kind];
  ctx.save();

  ctx.globalAlpha = 0.18;
  ellipse(ctx, 0, 34, 34, 8);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = 1;

  drawFoundation(ctx, skin, level);

  if (kind === "thorn") drawBrambleNest(ctx, skin, t, phase);
  else if (kind === "frost") drawFrostBloom(ctx, skin, t, phase);
  else if (kind === "boulder") drawCairn(ctx, skin);
  else drawHollowTrunk(ctx, skin, t, phase);

  ctx.restore();
}

/**
 * Shared nest progression, drawn under whichever nest follows: a ring of
 * shored-up stones that fills in as the tower levels, gold-flecked at 5. Doing
 * it here rather than per-nest keeps the four kinds from drifting apart.
 */
function drawFoundation(ctx: Ctx, skin: Nest, level: number) {
  if (level < 2) return;

  // Level 5 gets a warm ring on the ground. At 40px this is the clearest
  // "maxed out" tell there is — fine gear detail simply vanishes at that size.
  if (level >= 5) {
    const halo = ctx.createRadialGradient(0, 30, 6, 0, 30, 52);
    halo.addColorStop(0, "rgba(255, 215, 106, 0.5)");
    halo.addColorStop(1, "rgba(255, 215, 106, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 30, 52, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stone colour steps up per tier, so the base reads even when the guardian's
  // gear doesn't.
  const tone =
    level >= 5
      ? { fill: "#ffd76a", shade: "#e0a92f" }
      : level >= 4
        ? { fill: "#a8cf7d", shade: "#83a95c" }
        : { fill: skin.base, shade: skin.shade };

  // Kept well inside the design box: a level-5 tower is scaled up ~27%, and
  // anything near the edge here would spill into the neighbouring cell.
  const stones = [0, 2, 4, 6, 8][Math.min(4, level - 1)];
  for (let i = 0; i < stones; i += 1) {
    const spread = (i / (stones - 1 || 1) - 0.5) * 2;
    const x = spread * 33;
    const y = 27 - Math.abs(spread) * 3;
    ellipse(ctx, x, y, 6.5, 4.4);
    shape(ctx, tone.fill, 2.6);
    underside(ctx, x, y, 6.5, 4.4, tone.shade);
  }
}

type Nest = { base: string; shade: string; accent: string; bloom: string };

/**
 * Shallow woven bowl. Kept low and wide so the chick reads as sitting *in*
 * it — a taller nest just hides the guardian.
 */
function drawBrambleNest(ctx: Ctx, skin: Nest, t: number, phase: number) {
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 36, 20, 12, 7);
    ctx.save();
    ctx.rotate(side * 0.2);
    shape(ctx, skin.accent, 3.4);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(-38, 8);
  ctx.quadraticCurveTo(-34, 34, 0, 36);
  ctx.quadraticCurveTo(34, 34, 38, 8);
  ctx.closePath();
  shape(ctx, skin.base);
  underside(ctx, 0, 18, 38, 26, skin.shade);

  // Rim first, then weave marks over it, or the twigs look painted on.
  ellipse(ctx, 0, 8, 38, 11);
  shape(ctx, skin.shade);
  ellipse(ctx, 0, 8, 30, 7);
  shape(ctx, "#7d5637", 3);

  ink(ctx, 3);
  for (let i = 0; i < 5; i += 1) {
    const x = -26 + i * 13;
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.quadraticCurveTo(x + 5, 24, x + 1, 32);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.45 + Math.sin(t * 2.4 + phase) * 0.14;
  ellipse(ctx, 0, 7, 24, 6);
  ctx.fillStyle = skin.bloom;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A chunky ice outcrop — three fat prisms read far better than a star. */
function drawFrostBloom(ctx: Ctx, skin: Nest, t: number, phase: number) {
  const pulse = Math.sin(t * 2.1 + phase);

  ctx.globalAlpha = 0.35 + pulse * 0.1;
  ellipse(ctx, 0, 16, 40, 16);
  ctx.fillStyle = skin.bloom;
  ctx.fill();
  ctx.globalAlpha = 1;

  // The tall prism goes at the back and stays short enough that the fox
  // perching on top can't swallow it.
  const prisms: [number, number, number, number][] = [
    [-1, 26, 17, 30],
    [-27, 30, 14, 20],
    [26, 28, 13, 24],
  ];
  for (const [cx, base, halfWidth, height] of prisms) {
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, base);
    ctx.lineTo(cx - halfWidth * 0.7, base - height);
    ctx.lineTo(cx, base - height - 8);
    ctx.lineTo(cx + halfWidth * 0.7, base - height);
    ctx.lineTo(cx + halfWidth, base);
    ctx.closePath();
    shape(ctx, skin.base);

    // Lit facet down one side gives the prisms their edge.
    ctx.beginPath();
    ctx.moveTo(cx, base);
    ctx.lineTo(cx, base - height - 8);
    ctx.lineTo(cx + halfWidth * 0.7, base - height);
    ctx.lineTo(cx + halfWidth, base);
    ctx.closePath();
    ctx.fillStyle = skin.shade;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < 3; i += 1) {
    const drift = (t * 0.5 + phase + i * 0.33) % 1;
    ellipse(ctx, -26 + i * 26, 4 - drift * 26, 3 * (1 - drift), 3 * (1 - drift));
    ctx.fillStyle = skin.accent;
    ctx.globalAlpha = 0.8 * (1 - drift);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Three stacked stones. Flat-topped so the boar has somewhere to stand. */
function drawCairn(ctx: Ctx, skin: Nest) {
  const stones: [number, number, number, number][] = [
    [0, 28, 36, 13],
    [-3, 8, 28, 13],
    [2, -10, 22, 11],
  ];
  for (const [cx, cy, rx, ry] of stones) {
    ellipse(ctx, cx, cy, rx, ry);
    shape(ctx, skin.base);
    underside(ctx, cx, cy, rx, ry, skin.shade);
  }
  ellipse(ctx, -30, 18, 11, 6);
  ctx.save();
  ctx.rotate(-0.25);
  shape(ctx, skin.accent, 3.4);
  ctx.restore();
}

/** A hollow stump: flat mossy top for the wolf, spark crackling in the hollow. */
function drawHollowTrunk(ctx: Ctx, skin: Nest, t: number, phase: number) {
  ctx.beginPath();
  ctx.moveTo(-30, 34);
  ctx.quadraticCurveTo(-34, 2, -30, -14);
  ctx.lineTo(30, -14);
  ctx.quadraticCurveTo(34, 2, 30, 34);
  ctx.closePath();
  shape(ctx, skin.base);
  underside(ctx, 0, 10, 32, 26, skin.shade);

  ink(ctx, 3);
  for (const x of [-14, 12]) {
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.quadraticCurveTo(x + 4, 12, x, 30);
    ctx.stroke();
  }

  // The hollow, with a spark inside it.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 16, 13, 15, 0, 0, Math.PI * 2);
  shape(ctx, "#54405f", 3.4);
  ctx.clip();
  ctx.globalAlpha = 0.55 + Math.abs(Math.sin(t * 7 + phase)) * 0.45;
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.lineTo(4, 13);
  ctx.lineTo(-2, 14);
  ctx.lineTo(5, 26);
  ctx.lineTo(-6, 17);
  ctx.lineTo(1, 15);
  ctx.closePath();
  ctx.fillStyle = skin.bloom;
  ctx.fill();
  ctx.restore();

  ellipse(ctx, 0, -14, 32, 12);
  shape(ctx, "#8fb069");
  ellipse(ctx, 0, -15, 22, 7);
  shape(ctx, "#a8cf7d", 3);
}

/**
 * The animal on top of the nest. Drawn facing right in the same 100-box, so
 * callers position it independently of the nest.
 */
/**
 * Where gear attaches on each animal. The four guardians have different
 * proportions, so the shared level-up gear (headband, helmet, pauldron, cape)
 * reads off these anchors instead of hardcoding positions per animal.
 */
const GUARDIAN_RIG: Record<
  TowerKind,
  {
    /** Centre of the brow, where a band or helmet brim sits. */
    brow: { x: number; y: number; halfWidth: number };
    shoulder: { x: number; y: number };
    /** Where a cape hangs from. */
    back: { x: number; y: number };
    eyes: { x: number; y: number; spread: number; r: number };
  }
> = {
  thorn: {
    // The chick has no separate head, so its brow sits low on the body and the
    // band has to be wide enough not to look like a hat balanced on a ball.
    brow: { x: 8, y: -9, halfWidth: 23 },
    shoulder: { x: -8, y: 4 },
    back: { x: -16, y: -2 },
    eyes: { x: 10, y: -6, spread: 6, r: 4.4 },
  },
  frost: {
    brow: { x: 20, y: -13, halfWidth: 15 },
    shoulder: { x: 0, y: 2 },
    back: { x: -12, y: -2 },
    eyes: { x: 20, y: -6, spread: 7, r: 4.2 },
  },
  boulder: {
    brow: { x: 20, y: -10, halfWidth: 15 },
    shoulder: { x: -4, y: -2 },
    back: { x: -18, y: -2 },
    eyes: { x: 22, y: -4, spread: 7, r: 4.2 },
  },
  lightning: {
    brow: { x: 21, y: -13, halfWidth: 15 },
    shoulder: { x: -2, y: 0 },
    back: { x: -14, y: -2 },
    eyes: { x: 21, y: -7, spread: 7, r: 4.2 },
  },
};

/**
 * `level` runs 1..5 and layers on gear as a tower upgrades — see `drawRank`.
 * Everything is additive, so a level-5 guardian is still recognisably the same
 * animal as its level-1 self.
 */
export function drawGuardian(
  ctx: Ctx,
  kind: TowerKind,
  t: number,
  phase: number,
  level = 1,
) {
  const bob = Math.sin(t * 2.6 + phase) * 3;
  const rig = GUARDIAN_RIG[kind];
  ctx.save();
  ctx.translate(0, bob);

  if (level >= 5) drawAura(ctx, t, phase);
  if (level >= 4) drawCape(ctx, rig.back, t, phase, level);

  if (kind === "thorn") drawChick(ctx, t, phase);
  else if (kind === "frost") drawFox(ctx, t, phase);
  else if (kind === "boulder") drawBoar(ctx, t, phase);
  else drawWolf(ctx, t, phase);

  drawRank(ctx, rig, t, phase, level);
  ctx.restore();
}

/** Gear stack for levels 2–5. Order matters: back-to-front. */
function drawRank(
  ctx: Ctx,
  rig: (typeof GUARDIAN_RIG)[TowerKind],
  t: number,
  phase: number,
  level: number,
) {
  if (level >= 3) drawPauldron(ctx, rig.shoulder);
  // A determined brow is what sells "tougher" without making them look mean.
  if (level >= 3) drawBrows(ctx, rig.eyes, level);
  if (level >= 4) drawHelmet(ctx, rig.brow, level);
  else if (level >= 2) drawHeadband(ctx, rig.brow);
  if (level >= 5) drawSparkles(ctx, t, phase);
}

/** Soft radial halo behind a fully upgraded guardian. */
function drawAura(ctx: Ctx, t: number, phase: number) {
  const pulse = 0.5 + Math.sin(t * 2 + phase) * 0.14;
  const glow = ctx.createRadialGradient(6, -4, 4, 6, -4, 46);
  glow.addColorStop(0, `rgba(255, 231, 138, ${0.55 * pulse + 0.2})`);
  glow.addColorStop(1, "rgba(255, 231, 138, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(6, -4, 46, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Leaf headband, level 2. The band itself is barely a pixel at board size, so
 * the actual read is the sprig standing up out of the silhouette.
 */
function drawHeadband(ctx: Ctx, brow: { x: number; y: number; halfWidth: number }) {
  const { x, y, halfWidth } = brow;
  ctx.beginPath();
  ctx.moveTo(x - halfWidth, y + 4);
  ctx.quadraticCurveTo(x, y - 5, x + halfWidth, y + 4);
  ctx.quadraticCurveTo(x, y + 1, x - halfWidth, y + 4);
  ctx.closePath();
  shape(ctx, "#8fbf3f", 2.8);

  ctx.beginPath();
  ctx.moveTo(x - 3, y);
  ctx.quadraticCurveTo(x - 7, y - 10, x - 5, y - 17);
  ink(ctx, 3);
  ctx.stroke();
  for (const [dx, dy, rot] of [
    [-11, -15, -0.9],
    [1, -18, 0.5],
  ] as [number, number, number][]) {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.rotate(rot);
    ellipse(ctx, 0, 0, 8, 4.6);
    shape(ctx, "#b9e769", 2.8);
    ctx.restore();
  }
}

/**
 * Acorn cap, level 4+. Deliberately small and perched high: a full helm covers
 * the eyes, and the eyes are the whole reason these read as cute.
 */
function drawHelmet(
  ctx: Ctx,
  brow: { x: number; y: number; halfWidth: number },
  level: number,
) {
  const { x, y, halfWidth } = brow;
  const w = halfWidth * 0.7;
  const brim = y - 3;
  const crown = brim - 13;

  ctx.beginPath();
  ctx.moveTo(x - w, brim);
  ctx.quadraticCurveTo(x - w * 0.95, crown, x, crown - 2);
  ctx.quadraticCurveTo(x + w * 0.95, crown, x + w, brim);
  ctx.closePath();
  shape(ctx, "#b08455", 3);
  underside(ctx, x, brim - 6, w, 8, "#8d6338");

  ink(ctx, 1.8);
  for (const i of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x + i * w, crown + 3);
    ctx.lineTo(x + i * w * 0.8, brim - 1);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(x, crown - 2);
  ctx.lineTo(x + 2, crown - 11);
  ink(ctx, 3);
  ctx.stroke();
  ellipse(ctx, x + 2, crown - 12, 3.4, 3.4);
  shape(ctx, level >= 5 ? "#ffd76a" : "#8fbf3f", 2.4);

  ctx.beginPath();
  ctx.moveTo(x - w, brim);
  ctx.quadraticCurveTo(x, brim + 5, x + w, brim);
  ctx.quadraticCurveTo(x, brim + 1, x - w, brim);
  ctx.closePath();
  shape(ctx, level >= 5 ? "#ffd76a" : "#8fbf3f", 2.6);

  // Level 5 sweeps a gold laurel back off the cap.
  if (level >= 5) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        ctx.save();
        ctx.translate(x + side * (w * 0.7 + i * 5), brim - 8 + i * 4);
        ctx.rotate(side * (0.6 + i * 0.28));
        ellipse(ctx, 0, 0, 5.4, 3);
        shape(ctx, "#ffe08a", 2);
        ctx.restore();
      }
    }
  }
}

/** Bark shoulder plate. */
function drawPauldron(ctx: Ctx, shoulder: { x: number; y: number }) {
  const { x, y } = shoulder;
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 2);
  ctx.quadraticCurveTo(x, y - 13, x + 11, y - 2);
  ctx.quadraticCurveTo(x + 9, y + 7, x, y + 8);
  ctx.quadraticCurveTo(x - 9, y + 7, x - 11, y - 2);
  ctx.closePath();
  shape(ctx, "#a3805e", 3);
  underside(ctx, x, y - 1, 11, 9, "#84613f");
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 1);
  ctx.quadraticCurveTo(x, y - 4, x + 7, y + 1);
  ink(ctx, 2.2);
  ctx.stroke();
}

/** Angled brows over the existing eyes — cute-determined, not angry. */
function drawBrows(
  ctx: Ctx,
  eyes: { x: number; y: number; spread: number; r: number },
  level: number,
) {
  const tilt = level >= 5 ? 3.4 : 2.4;
  ink(ctx, 2.8);
  for (const side of [-1, 1]) {
    const cx = eyes.x + side * eyes.spread;
    ctx.beginPath();
    ctx.moveTo(cx - eyes.r * 1.2, eyes.y - eyes.r - tilt + (side < 0 ? tilt : 0));
    ctx.lineTo(cx + eyes.r * 1.2, eyes.y - eyes.r - tilt + (side < 0 ? 0 : tilt));
    ctx.stroke();
  }
}

/** Moss mantle trailing off the back. */
function drawCape(
  ctx: Ctx,
  back: { x: number; y: number },
  t: number,
  phase: number,
  level: number,
) {
  const { x, y } = back;
  const flutter = Math.sin(t * 2.2 + phase) * 4;
  const reach = level >= 5 ? 30 : 22;
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 4);
  ctx.quadraticCurveTo(x - 6, y + 6, x - reach + flutter, y + 20);
  ctx.quadraticCurveTo(x - 6, y + 22, x + 6, y + 16);
  ctx.closePath();
  shape(ctx, level >= 5 ? "#6f9e58" : "#7fb56a", 3);

  ctx.beginPath();
  ctx.moveTo(x + 8, y - 5);
  ctx.quadraticCurveTo(x, y - 9, x - 8, y - 4);
  ink(ctx, 3.4);
  ctx.stroke();
}

/** Two motes circling a maxed guardian. */
function drawSparkles(ctx: Ctx, t: number, phase: number) {
  for (let i = 0; i < 2; i += 1) {
    const a = t * 1.7 + phase + i * Math.PI;
    const px = 8 + Math.cos(a) * 30;
    const py = -8 + Math.sin(a) * 15;
    const r = 2.6 + Math.sin(a * 2) * 0.8;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.beginPath();
    for (let p = 0; p < 4; p += 1) {
      const angle = (p / 4) * Math.PI * 2;
      ctx.lineTo(Math.cos(angle) * r * (p % 2 ? 0.35 : 1.6), Math.sin(angle) * r * (p % 2 ? 0.35 : 1.6));
    }
    ctx.closePath();
    ctx.fillStyle = "#fff3b0";
    ctx.fill();
    ctx.restore();
  }
}

function tail(ctx: Ctx, fill: string, t: number, phase: number, reach: number) {
  const wag = Math.sin(t * 3.4 + phase) * 0.3;
  ctx.save();
  ctx.translate(-26, 6);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.quadraticCurveTo(-reach, 4, -reach * 0.8, -reach * 0.7);
  ctx.quadraticCurveTo(-reach * 0.2, -reach * 0.3, 4, -6);
  ctx.closePath();
  shape(ctx, fill, 3.6);
  ctx.restore();
}

function drawChick(ctx: Ctx, t: number, phase: number) {
  ink(ctx, 3.4);
  for (const dx of [-6, 8]) {
    ctx.beginPath();
    ctx.moveTo(dx, 22);
    ctx.lineTo(dx, 34);
    ctx.stroke();
  }

  ellipse(ctx, 0, 4, 26, 24);
  shape(ctx, "#ffd257");
  underside(ctx, 0, 4, 26, 24, "#eba62c");

  // Wing lifts on the same beat as the tail wag on the other animals.
  ctx.save();
  ctx.translate(-2, 6);
  ctx.rotate(Math.sin(t * 4 + phase) * 0.22);
  ellipse(ctx, 0, 0, 13, 9);
  shape(ctx, "#ffe9a3", 3.4);
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(22, -2);
  ctx.lineTo(38, 3);
  ctx.lineTo(22, 9);
  ctx.closePath();
  shape(ctx, "#e89a2f", 3.4);

  cheeks(ctx, 8, 8, 8, 5, "#eb8f6b");
  eyes(ctx, 10, -6, 6, 4.4, blink(t, phase));
}

function drawFox(ctx: Ctx, t: number, phase: number) {
  tail(ctx, "#fff1dc", t, phase, 26);

  ellipse(ctx, 0, 8, 26, 19);
  shape(ctx, "#f2f4fb");
  underside(ctx, 0, 8, 26, 19, "#cdd6ea");

  for (const dx of [16, -4]) {
    ctx.beginPath();
    ctx.moveTo(dx - 4, 22);
    ctx.lineTo(dx - 2, 32);
    ink(ctx, 4);
    ctx.stroke();
  }

  for (const [dx, dy] of [
    [8, -20],
    [22, -18],
  ]) {
    ctx.beginPath();
    ctx.moveTo(dx - 7, dy + 10);
    ctx.lineTo(dx, dy - 12);
    ctx.lineTo(dx + 8, dy + 8);
    ctx.closePath();
    shape(ctx, "#f2f4fb", 3.4);
  }

  ellipse(ctx, 20, -2, 18, 15);
  shape(ctx, "#f8fafe");

  ctx.beginPath();
  ctx.moveTo(30, -2);
  ctx.quadraticCurveTo(42, 0, 38, 7);
  ctx.quadraticCurveTo(33, 8, 30, 6);
  ctx.closePath();
  shape(ctx, "#fff1dc", 3.2);
  ellipse(ctx, 39, 2, 3.4, 2.8);
  ctx.fillStyle = INK;
  ctx.fill();

  cheeks(ctx, 22, 2, 10, 4.4, "#8ee8ff");
  eyes(ctx, 20, -6, 7, 4.2, blink(t, phase));
}

function drawBoar(ctx: Ctx, t: number, phase: number) {
  tail(ctx, "#a3714a", t, phase, 12);

  ellipse(ctx, -2, 6, 28, 21);
  shape(ctx, "#c08557");
  underside(ctx, -2, 6, 28, 21, "#96603a");

  ink(ctx, 4.4);
  for (const dx of [14, -8]) {
    ctx.beginPath();
    ctx.moveTo(dx, 24);
    ctx.lineTo(dx + 1, 33);
    ctx.stroke();
  }

  // Bristly mane — three short strokes, enough to read as "boar".
  ink(ctx, 3.4);
  for (let i = 0; i < 3; i += 1) {
    const x = -12 + i * 10;
    ctx.beginPath();
    ctx.moveTo(x, -14);
    ctx.lineTo(x + 2, -26 + Math.sin(t * 5 + phase + i) * 2);
    ctx.stroke();
  }

  ellipse(ctx, 20, 2, 18, 16);
  shape(ctx, "#c9905f");

  ctx.beginPath();
  ctx.moveTo(16, -16);
  ctx.lineTo(24, -28);
  ctx.lineTo(28, -14);
  ctx.closePath();
  shape(ctx, "#a3714a", 3.2);

  ellipse(ctx, 36, 8, 9, 7);
  shape(ctx, "#f0b78c", 3.2);
  for (const dx of [-3, 3]) {
    ellipse(ctx, 36 + dx, 8, 1.8, 2.4);
    ctx.fillStyle = INK;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(30, 12);
  ctx.quadraticCurveTo(30, 2, 25, 0);
  ink(ctx, 3.4);
  ctx.stroke();

  eyes(ctx, 22, -4, 7, 4.2, blink(t, phase));
}

function drawWolf(ctx: Ctx, t: number, phase: number) {
  tail(ctx, "#cdd2e2", t, phase, 22);

  ellipse(ctx, -2, 6, 28, 19);
  shape(ctx, "#aeb5cb");
  underside(ctx, -2, 6, 28, 19, "#868ea8");

  ink(ctx, 4);
  for (const dx of [16, -6]) {
    ctx.beginPath();
    ctx.moveTo(dx, 22);
    ctx.lineTo(dx + 1, 33);
    ctx.stroke();
  }

  for (const [dx, dy] of [
    [8, -20],
    [24, -18],
  ]) {
    ctx.beginPath();
    ctx.moveTo(dx - 7, dy + 10);
    ctx.lineTo(dx + 1, dy - 14);
    ctx.lineTo(dx + 8, dy + 8);
    ctx.closePath();
    shape(ctx, "#aeb5cb", 3.4);
  }

  ellipse(ctx, 21, -2, 18, 15);
  shape(ctx, "#bcc3d7");

  ctx.beginPath();
  ctx.moveTo(31, -1);
  ctx.quadraticCurveTo(45, 1, 40, 9);
  ctx.quadraticCurveTo(34, 10, 31, 7);
  ctx.closePath();
  shape(ctx, "#e4e8f2", 3.2);
  ellipse(ctx, 41, 3, 3.6, 3);
  ctx.fillStyle = INK;
  ctx.fill();

  cheeks(ctx, 23, 2, 10, 4.4, "#b9e769");
  eyes(ctx, 21, -7, 7, 4.2, blink(t, phase));
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** The Heartwood: a round canopy over a trunk with a glowing heart. */
export function drawHeartwood(ctx: Ctx, t: number, health: number) {
  const sway = Math.sin(t * 1.4) * 0.035;
  ctx.save();

  ctx.globalAlpha = 0.16;
  ellipse(ctx, 0, 40, 30, 7);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(-11, 42);
  ctx.quadraticCurveTo(-8, 6, -7, -6);
  ctx.lineTo(7, -6);
  ctx.quadraticCurveTo(8, 6, 11, 42);
  ctx.closePath();
  shape(ctx, "#b98c5f");

  ctx.save();
  ctx.translate(0, -6);
  ctx.rotate(sway);
  for (const [cx, cy, r, fill] of [
    [-22, -6, 22, "#7fb56a"],
    [22, -8, 21, "#7fb56a"],
    [0, -28, 26, "#96cc74"],
  ] as [number, number, number, string][]) {
    ellipse(ctx, cx, cy, r, r * 0.92);
    shape(ctx, fill);
  }
  // Blossoms fade out as the Heartwood takes damage.
  ctx.globalAlpha = 0.35 + health * 0.65;
  for (const [cx, cy] of [
    [-24, -20],
    [16, -30],
    [28, 0],
    [-8, -44],
  ] as [number, number][]) {
    ellipse(ctx, cx, cy, 5, 5);
    ctx.fillStyle = "#f3a6df";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  const beat = 1 + Math.sin(t * 3.4) * 0.09 * (0.4 + health);
  ctx.save();
  ctx.translate(0, 16);
  ctx.scale(beat, beat);
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.quadraticCurveTo(-13, -1, -6.5, -8);
  ctx.quadraticCurveTo(0, -11, 0, -4);
  ctx.quadraticCurveTo(0, -11, 6.5, -8);
  ctx.quadraticCurveTo(13, -1, 0, 9);
  ctx.closePath();
  shape(ctx, health > 0.35 ? "#ffd76a" : "#e95d78", 3.4);
  ctx.restore();

  ctx.restore();
}

/** The rift: a stone arch around a swirling violet portal. */
export function drawRift(ctx: Ctx, t: number) {
  ctx.save();

  ctx.globalAlpha = 0.16;
  ellipse(ctx, 0, 40, 28, 7);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = 1;

  ellipse(ctx, 0, 2, 32, 36);
  shape(ctx, "#c3bcd2");
  underside(ctx, 0, 2, 32, 36, "#9c93b3");

  ellipse(ctx, 0, 2, 22, 26);
  shape(ctx, "#5b3f74", 3.6);

  // Two counter-rotating spirals; cheap way to read as "swirling".
  ctx.save();
  ellipse(ctx, 0, 2, 21, 25);
  ctx.clip();
  for (const dir of [1, -1]) {
    ctx.save();
    ctx.translate(0, 2);
    ctx.rotate(t * 1.5 * dir);
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const a = (i / 40) * Math.PI * 3;
      const r = (i / 40) * 22;
      const x = Math.cos(a) * r * 0.85;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = dir > 0 ? "#b98ce0" : "#8ee8ff";
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  for (let i = 0; i < 4; i += 1) {
    const a = t * 0.9 + (i / 4) * Math.PI * 2;
    ellipse(ctx, Math.cos(a) * 30, 2 + Math.sin(a) * 34, 3.6, 3.6);
    ctx.fillStyle = "#d8c9f2";
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * Shots are drawn in board pixels, not the 100-box: a pellet travels over the
 * first `TRAVEL` of its life and then bursts, so each tower reads differently
 * even though damage already landed the moment it fired.
 */
const TRAVEL = 0.62;

export function drawShot(
  ctx: Ctx,
  kind: TowerKind,
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
  seed: number,
  arc: boolean,
) {
  if (kind === "lightning") {
    drawBolt(ctx, from, to, progress, seed);
    return;
  }

  const travel = Math.min(1, progress / TRAVEL);
  const eased = travel * travel * (3 - 2 * travel);
  const x = from.x + (to.x - from.x) * eased;
  const lift = arc ? Math.sin(eased * Math.PI) * 26 : 0;
  const y = from.y + (to.y - from.y) * eased - lift;

  if (progress < TRAVEL) {
    ctx.save();
    ctx.translate(x, y);
    // Ghost trail: a few shrinking copies behind the pellet.
    for (let i = 1; i <= 3; i += 1) {
      const back = eased - i * 0.055;
      if (back <= 0) continue;
      const tx = from.x + (to.x - from.x) * back - x;
      const ty =
        from.y + (to.y - from.y) * back - (arc ? Math.sin(back * Math.PI) * 26 : 0) - y;
      ellipse(ctx, tx, ty, 2.6 - i * 0.6, 2.6 - i * 0.6);
      ctx.fillStyle = SHOT_TRAIL[kind];
      ctx.globalAlpha = 0.34 - i * 0.09;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.rotate(travel * (kind === "boulder" ? 5.5 : 9) * (seed % 2 ? 1 : -1));
    if (kind === "thorn") drawSeed(ctx);
    else if (kind === "frost") drawFlake(ctx);
    else drawPollen(ctx);
    ctx.restore();
    return;
  }

  const burst = (progress - TRAVEL) / (1 - TRAVEL);
  drawBurst(ctx, to.x, to.y, burst, kind);
}

const SHOT_TRAIL: Record<TowerKind, string> = {
  thorn: "#b9e769",
  frost: "#8ee8ff",
  boulder: "#e89a2f",
  lightning: "#ffe66a",
};

/** A seed with two leaves. */
function drawSeed(ctx: Ctx) {
  ellipse(ctx, 0, 0, 4.6, 3.2);
  ctx.fillStyle = "#8a5f3c";
  ctx.fill();
  ink(ctx, 1);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 4, -2.4, 3.4, 1.8);
    ctx.fillStyle = "#b9e769";
    ctx.fill();
  }
}

function drawFlake(ctx: Ctx) {
  ctx.strokeStyle = "#e8f8ff";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * 5.5, -Math.sin(a) * 5.5);
    ctx.lineTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
    ctx.stroke();
  }
  ellipse(ctx, 0, 0, 2.2, 2.2);
  ctx.fillStyle = "#8ee8ff";
  ctx.fill();
}

/** A pollen ball with orbiting motes. */
function drawPollen(ctx: Ctx) {
  ellipse(ctx, 0, 0, 6, 6);
  ctx.fillStyle = "#e89a2f";
  ctx.fill();
  ink(ctx, 1.2);
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    ellipse(ctx, Math.cos(a) * 8, Math.sin(a) * 8, 2, 2);
    ctx.fillStyle = "#ffe08a";
    ctx.fill();
  }
}

/** Expanding ring plus a few flung specks. */
function drawBurst(ctx: Ctx, x: number, y: number, progress: number, kind: TowerKind) {
  const fade = 1 - progress;
  const radius = (kind === "boulder" ? 22 : 12) * (0.35 + progress * 0.9);
  ctx.save();
  ctx.globalAlpha = fade * 0.85;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = SHOT_TRAIL[kind];
  ctx.lineWidth = 3.5 * fade + 1;
  ctx.stroke();

  const specks = kind === "boulder" ? 7 : 5;
  for (let i = 0; i < specks; i += 1) {
    const a = (i / specks) * Math.PI * 2 + progress;
    const d = radius * 0.9;
    ellipse(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 2.4 * fade + 0.6, 2.4 * fade + 0.6);
    ctx.fillStyle = SHOT_TRAIL[kind];
    ctx.fill();
  }
  ctx.restore();
}

/** Lightning doesn't travel — it flashes as a jagged polyline and fades. */
function drawBolt(
  ctx: Ctx,
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
  seed: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const steps = Math.max(4, Math.min(10, Math.round(length / 9)));
  const fade = Math.max(0, 1 - progress);

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    for (let i = 1; i < steps; i += 1) {
      const f = i / steps;
      // Alternating sides force a real zigzag; the deterministic magnitude
      // keeps the bolt's shape stable while it fades.
      const swing = (i % 2 === 0 ? 1 : -1) * (5 + Math.abs(Math.sin(seed * 91.7 + i)) * 5);
      const wobble = swing * Math.sin(f * Math.PI);
      ctx.lineTo(from.x + dx * f + nx * wobble, from.y + dy * f + ny * wobble);
    }
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = fade * 0.4;
  ctx.strokeStyle = "#ffe66a";
  ctx.lineWidth = 7;
  trace();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = "#fffbe0";
  ctx.lineWidth = 2.2;
  trace();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * Soft sage checker with scattered tufts and pebbles. Deterministic from the
 * cell coordinates so it never shimmers between frames.
 */
export function drawGrass(
  ctx: Ctx,
  cols: number,
  rows: number,
  cell: number,
  t: number,
) {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#cfe3ac" : "#c7dda2";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  ctx.strokeStyle = "rgba(90, 116, 66, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 1; x < cols; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, rows * cell);
    ctx.stroke();
  }
  for (let y = 1; y < rows; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(cols * cell, y * cell + 0.5);
    ctx.stroke();
  }

  ctx.lineCap = "round";
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const hash = (x * 73856093) ^ (y * 19349663);
      const pick = Math.abs(hash) % 7;
      // Only every seventh cell gets anything — sparse reads as meadow,
      // dense reads as hatching.
      if (pick > 1) continue;
      const ox = x * cell + 9 + (Math.abs(hash >> 3) % 18);
      const oy = y * cell + 11 + (Math.abs(hash >> 7) % 18);
      if (pick === 1) {
        ellipse(ctx, ox, oy, 2.8, 2);
        ctx.fillStyle = "rgba(150, 158, 176, 0.4)";
        ctx.fill();
        continue;
      }
      const lean = Math.sin(t * 1.3 + x * 0.7 + y) * 1.2;
      ctx.strokeStyle = "rgba(140, 174, 106, 0.7)";
      ctx.lineWidth = 1.6;
      for (const dx of [-2.5, 0, 2.5]) {
        ctx.beginPath();
        ctx.moveTo(ox + dx, oy + 3);
        ctx.quadraticCurveTo(ox + dx * 1.6 + lean, oy - 1, ox + dx * 2.2 + lean, oy - 5);
        ctx.stroke();
      }
    }
  }
}

/** Rounded health pip above a blightling. */
export function drawHealthBar(ctx: Ctx, x: number, y: number, ratio: number, width: number) {
  const height = 5;
  const radius = height / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y, width, height, radius);
  ctx.fillStyle = "rgba(61, 48, 80, 0.55)";
  ctx.fill();
  if (ratio > 0) {
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y, Math.max(height, width * ratio), height, radius);
    ctx.fillStyle = ratio > 0.45 ? "#b9e769" : "#e95d78";
    ctx.fill();
  }
  ctx.restore();
}
