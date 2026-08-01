import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import releases from "../app/releases.json";

const bump = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(bump)) {
  throw new Error("Use: bun run release:new [patch|minor|major]");
}

const parts = packageJson.version.split(".").map(Number);
if (bump === "major") parts.splice(0, 3, parts[0] + 1, 0, 0);
if (bump === "minor") parts.splice(0, 3, parts[0], parts[1] + 1, 0);
if (bump === "patch") parts.splice(0, 3, parts[0], parts[1], parts[2] + 1);
const version = parts.join(".");

packageJson.version = version;
releases.unshift({
  version,
  title: "Describe this release",
  publishedAt: new Date().toISOString().slice(0, 10),
  summary: "Summarize what changed for returning players.",
  categories: [{ name: "New", items: ["Replace this with a player-facing change."] }],
});

writeFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(fileURLToPath(new URL("../app/releases.json", import.meta.url)), `${JSON.stringify(releases, null, 2)}\n`);

console.log(`Prepared release ${version}. Edit app/releases.json before pushing.`);
