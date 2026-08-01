import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type VersionAnnouncement = {
  version: string;
  title: string;
  publishedAt: string;
  summary: string;
  changes: string[];
};

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function nextVersion(version: string, bump: "patch" | "minor") {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`package.json has an invalid version: ${version}`);
  }
  if (bump === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  return parts.join(".");
}

function outputText(response: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("");
}

async function writeAnnouncement(changes: string, version: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate the version notes.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.VERSION_MODEL ?? "gpt-5-mini",
      store: false,
      instructions: "You write concise, accurate player-facing game update notes. Ignore internal tooling, refactors, lockfiles, and documentation unless they directly change what players experience. Do not invent features. Use a specific, energetic title of at most five words; never use generic titles such as 'Describe this update', 'Update', or 'What's new'.",
      input: `Summarize these changes for Nature's Last Stand version ${version}:\n\n${changes}`,
      text: {
        format: {
          type: "json_schema",
          name: "version_announcement",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              changes: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 5,
              },
            },
            required: ["title", "summary", "changes"],
          },
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${await response.text()}`);
  const body = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = outputText(body);
  if (!text) throw new Error("OpenAI returned no version notes.");
  const result = JSON.parse(text) as Omit<VersionAnnouncement, "version" | "publishedAt">;
  return {
    version,
    publishedAt: new Date().toISOString().slice(0, 10),
    title: result.title.trim(),
    summary: result.summary.trim(),
    changes: result.changes.map((change) => change.trim()).filter(Boolean),
  } satisfies VersionAnnouncement;
}

if (git("status", "--porcelain")) {
  throw new Error("Commit or stash your changes before running bun run version.");
}

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
const versionsPath = fileURLToPath(new URL("../app/versions.json", import.meta.url));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
const requestedBump = process.env.VERSION_BUMP ?? "patch";
if (requestedBump !== "patch" && requestedBump !== "minor") {
  throw new Error("VERSION_BUMP must be either patch or minor.");
}
const version = nextVersion(packageJson.version, requestedBump);
const tag = `v${version}`;
const branch = git("branch", "--show-current");
if (!branch) throw new Error("Switch to a branch before running bun run version.");
const previousTag = git("tag", "--merged", "HEAD", "--sort=-v:refname")
  .split("\n")
  .find((candidate) => /^v\d+\.\d+\.\d+$/.test(candidate));
const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const changes = git("log", "--format=%h %s%n%b", range);

if (!changes) throw new Error("There are no commits to announce since the previous version tag.");

const announcement = await writeAnnouncement(changes, version);
const versions = JSON.parse(readFileSync(versionsPath, "utf8")) as VersionAnnouncement[];
packageJson.version = version;
versions.unshift(announcement);

writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);

git("add", "package.json", "app/versions.json");
git("commit", "-m", `Version ${version}`);
git("tag", "-a", tag, "-m", announcement.title);
git("push", "origin", branch, "--follow-tags");

console.log(`Published ${tag}: ${announcement.title}`);
