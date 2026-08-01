import { execFileSync } from "node:child_process";

import packageJson from "../package.json";
import releases from "../app/releases.json";

function git(...args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const current = releases[0];
const failures: string[] = [];

if (!current) failures.push("app/releases.json must contain a release.");
if (current?.version !== packageJson.version) {
  failures.push(`package.json is ${packageJson.version}, but the newest release is ${current?.version ?? "missing"}.`);
}
if (!current?.title.trim() || !current?.summary.trim()) {
  failures.push("The newest release needs a title and summary.");
}
if (
  current?.title === "Describe this release" ||
  current?.summary === "Summarize what changed for returning players." ||
  current?.categories.some((category) =>
    category.items.includes("Replace this with a player-facing change."),
  )
) {
  failures.push("Replace every generated release-note placeholder before pushing.");
}
if (!current?.categories.some((category) => category.items.some((item) => item.trim()))) {
  failures.push("The newest release needs at least one change item.");
}

const [localSha, remoteSha] = process.argv.slice(2);
const zeroSha = /^0+$/;

if (localSha && remoteSha && !zeroSha.test(localSha)) {
  let baseSha = remoteSha;
  if (zeroSha.test(remoteSha)) {
    baseSha = git("merge-base", localSha, "origin/main");
  }

  if (baseSha) {
    const changed = git("diff", "--name-only", baseSha, localSha)
      .split("\n")
      .filter(Boolean);
    const playerFacing = changed.some((file) =>
      /^(app|lib|public|supabase)\//.test(file) &&
      file !== "app/releases.json",
    );

    if (playerFacing) {
      if (!changed.includes("package.json")) {
        failures.push("Player-facing changes require a version bump in package.json.");
      }
      if (!changed.includes("app/releases.json")) {
        failures.push("Player-facing changes require an entry in app/releases.json.");
      }

      const previousPackage = git("show", `${baseSha}:package.json`);
      if (previousPackage) {
        const previousVersion = JSON.parse(previousPackage).version;
        if (previousVersion === packageJson.version) {
          failures.push(`Version ${packageJson.version} was already released; run bun run release:new.`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error("\nRelease check failed:\n");
  for (const failure of failures) console.error(`  • ${failure}`);
  console.error("\nRun `bun run release:new` to prepare the next What's New entry.\n");
  process.exit(1);
}

console.log(`Release ${packageJson.version} is ready.`);
