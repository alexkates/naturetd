import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(15_000);

const port = 3200 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  server = Bun.spawn(["bun", "run", "start", "--", "-p", String(port)], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/login`);
      if (response.ok) return;
    } catch {}

    await Bun.sleep(100);
  }

  throw new Error(`Production server did not start at ${origin}`);
});

afterAll(() => {
  server.kill();
});

test("gates the game behind sign-in", async () => {
  const response = await fetch(origin, { redirect: "manual" });
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  expect(response.headers.get("location") ?? "").toContain("/login");
});

test("renders the sign-in screen", async () => {
  const response = await fetch(`${origin}/login`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type") ?? "").toMatch(/^text\/html\b/i);

  const html = await response.text();
  expect(html).toMatch(/<title>Sign in · Nature&#x27;s Last Stand<\/title>/i);
  expect(html).toContain("Sign in to defend the Heartwood");
  expect(html).not.toMatch(/codex-preview|react-loading-skeleton/i);
});
