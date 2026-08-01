import type { BlightKind } from "@/app/art";
import type { SpellKind, TowerKind } from "@/lib/types";

export type CampaignTerrainKind = "mossStone" | "glowcap" | "emberPool" | "stormglass" | "blackroot";

export type CampaignRules = {
  difficulty: string;
  threat: number;
  challenge: string;
  startingGold: number;
  wavePeriod: number;
  enemyHpMultiplier: number;
  enemySpeedMultiplier: number;
  disabledTowers: TowerKind[];
  disabledSpells: SpellKind[];
};

export type CampaignBoss = {
  name: string;
  art: BlightKind;
  hp: number;
  speed: number;
  bounty: number;
  cityDamage: number;
};

export type CampaignNode = {
  id: string;
  order: number;
  name: string;
  region: string;
  story: string;
  victory: string;
  mapSeed: number;
  palette: [string, string];
  terrainKind: CampaignTerrainKind;
  terrain: Array<[number, number]>;
  rules: CampaignRules;
  bosses: [CampaignBoss, CampaignBoss, CampaignBoss, CampaignBoss];
};

const boss = (
  name: string,
  art: BlightKind,
  hp: number,
  speed: number,
  bounty: number,
  cityDamage = 4,
): CampaignBoss => ({ name, art, hp, speed, bounty, cityDamage });

export const CAMPAIGN_NODES: CampaignNode[] = [
  {
    id: "mosslight-edge",
    order: 1,
    name: "Mosslight Edge",
    region: "The waking meadow",
    story: "A soot-stained wren arrives with a seed that still hums. Follow its song beyond the grove and reopen the old green road.",
    victory: "Rain finds the meadow again. In the clean earth, roots point east toward a sky that has forgotten its stars.",
    mapSeed: 1847,
    palette: ["#dff0a8", "#9bcf78"],
    terrainKind: "mossStone",
    terrain: [[4, 2], [4, 3], [8, 6], [8, 7], [12, 2], [12, 3], [16, 6], [16, 7]],
    rules: {
      difficulty: "Bramblebound",
      threat: 1,
      challenge: "The meadow seals Wolfwood Roost and Wild Tornadoes.",
      startingGold: 450,
      wavePeriod: 30,
      enemyHpMultiplier: 1.05,
      enemySpeedMultiplier: 1,
      disabledTowers: ["lightning"],
      disabledSpells: ["tornado"],
    },
    bosses: [
      boss("Bogbelly Bruiser", "bogbelly", 7, 0.72, 90),
      boss("Cinderhorn", "cinderhorn", 10, 0.82, 130),
      boss("The Rust Matron", "rustMatron", 14, 0.6, 180, 5),
      boss("Maw of the Meadow", "meadowMaw", 20, 0.56, 300, 6),
    ],
  },
  {
    id: "fungal-hollows",
    order: 2,
    name: "Fungal Hollows",
    region: "The lantern caverns",
    story: "Beneath the meadow, whole constellations of mushrooms are going dark. The last glowmoths offer to guide you—if you can keep up.",
    victory: "The caverns blaze violet and gold. Their light reveals a forgotten river carrying black foam toward the coast.",
    mapSeed: 2911,
    palette: ["#d7c4ee", "#8e77b8"],
    terrainKind: "glowcap",
    terrain: [[3, 1], [3, 2], [7, 5], [7, 6], [11, 3], [11, 4], [15, 7], [15, 8], [17, 2]],
    rules: {
      difficulty: "Sporechoked",
      threat: 2,
      challenge: "Dense spores silence Boarstone Burrow and Solar Flare.",
      startingGold: 425,
      wavePeriod: 28,
      enemyHpMultiplier: 1.12,
      enemySpeedMultiplier: 1.03,
      disabledTowers: ["boulder"],
      disabledSpells: ["solar"],
    },
    bosses: [
      boss("Puffcap Prophet", "puffcapProphet", 8, 0.68, 100),
      boss("Gloomwing", "gloomwing", 11, 1.02, 145, 5),
      boss("The Mycelium Maw", "myceliumMaw", 16, 0.55, 195, 6),
      boss("Duchess Rotveil", "rotveil", 23, 0.5, 325, 7),
    ],
  },
  {
    id: "emberfen",
    order: 3,
    name: "Emberfen",
    region: "The smoking wetlands",
    story: "The river ends in a marsh of warm ash. Salamanders guard one living spring while sparks hunt through the reeds like fireflies.",
    victory: "Cool water spills into every channel. A silver salmon surfaces with a crown-shaped scar and a warning: the king is awake.",
    mapSeed: 4073,
    palette: ["#f5c990", "#c67a66"],
    terrainKind: "emberPool",
    terrain: [[2, 7], [3, 7], [6, 2], [7, 2], [10, 6], [11, 6], [14, 3], [15, 3], [17, 7]],
    rules: {
      difficulty: "Scorching",
      threat: 3,
      challenge: "The hot fen melts Foxglove Den and Ice Storm.",
      startingGold: 400,
      wavePeriod: 27,
      enemyHpMultiplier: 1.2,
      enemySpeedMultiplier: 1.06,
      disabledTowers: ["frost"],
      disabledSpells: ["ice"],
    },
    bosses: [
      boss("Ashsnout", "ashsnout", 9, 0.9, 110),
      boss("Sootscale", "sootscale", 13, 0.66, 155, 5),
      boss("Baron Boilwater", "boilwater", 18, 0.58, 210, 6),
      boss("The Fen Furnace", "fenFurnace", 26, 0.54, 350, 7),
    ],
  },
  {
    id: "stormglass-coast",
    order: 4,
    name: "Stormglass Coast",
    region: "The shattered shore",
    story: "At the sea, grime has hardened every wave into glass. Break a path through the frozen storm before the tide rings midnight.",
    victory: "The ocean moves. Far offshore, a black crown rises above the foam, and every cleansed creature turns toward it without being asked.",
    mapSeed: 5237,
    palette: ["#bce8e4", "#6fa9bc"],
    terrainKind: "stormglass",
    terrain: [[3, 2], [4, 2], [6, 7], [7, 7], [9, 3], [10, 3], [12, 6], [13, 6], [15, 2], [16, 2]],
    rules: {
      difficulty: "Tempest",
      threat: 4,
      challenge: "Glass winds strip Chickadee Bramble and Heartwood Bloom.",
      startingGold: 375,
      wavePeriod: 25,
      enemyHpMultiplier: 1.3,
      enemySpeedMultiplier: 1.1,
      disabledTowers: ["thorn"],
      disabledSpells: ["bloom"],
    },
    bosses: [
      boss("Galegullet", "galegullet", 10, 1.04, 120, 5),
      boss("Shardback", "shardback", 15, 0.64, 170, 6),
      boss("Admiral Smog", "admiralSmog", 21, 0.86, 225, 7),
      boss("The Glass Leviathan", "glassLeviathan", 29, 0.48, 375, 8),
    ],
  },
  {
    id: "blackroot-throne",
    order: 5,
    name: "Blackroot Throne",
    region: "The crown of grime",
    story: "The green road ends at a palace grown upside down. Carry the humming seed to its buried throne and end the long blight at its source.",
    victory: "The crown cracks. The seed becomes a sapling, the sapling becomes a sunrise, and every road home blooms at once.",
    mapSeed: 6841,
    palette: ["#b9aed4", "#665080"],
    terrainKind: "blackroot",
    terrain: [[2, 2], [2, 3], [5, 6], [5, 7], [8, 2], [9, 2], [11, 7], [12, 7], [15, 3], [15, 4], [17, 7]],
    rules: {
      difficulty: "Royal Blight",
      threat: 5,
      challenge: "The throne taxes every build: less gold, faster waves, and no Wild Tornadoes.",
      startingGold: 340,
      wavePeriod: 23,
      enemyHpMultiplier: 1.42,
      enemySpeedMultiplier: 1.14,
      disabledTowers: [],
      disabledSpells: ["tornado"],
    },
    bosses: [
      boss("Crownscab", "crownscab", 12, 0.72, 135, 5),
      boss("The Soot Chancellor", "sootChancellor", 17, 0.9, 185, 6),
      boss("Prince Putrescence", "princePutrescence", 24, 0.56, 245, 8),
      boss("The Grime King", "grimeKing", 34, 0.5, 500, 10),
    ],
  },
];

export const campaignNode = (id: string | null) =>
  CAMPAIGN_NODES.find((node) => node.id === id) ?? null;
