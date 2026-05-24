import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../src/cli.ts");

function runCli(args: string[], dbPath: string) {
  const proc = Bun.spawnSync(["bun", "run", CLI, ...args], {
    env: { ...process.env, COLLAB_DB: dbPath, COLLAB_ID: "default" },
  });
  return {
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
    exitCode: proc.exitCode,
  };
}

test("CLI: init → send → poll → ack → dump round-trip via the binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "collab-cli-"));
  const dbPath = join(dir, "collab.db");

  expect(runCli(["init"], dbPath).exitCode).toBe(0);

  const sent = runCli(
    ["send", "--as", "coding", "--kind", "question", "--content", "hello"],
    dbPath,
  );
  expect(sent.exitCode).toBe(0);
  const id = Number(sent.stdout);
  expect(id).toBeGreaterThan(0);

  const inbox = JSON.parse(runCli(["poll", "--as", "persona"], dbPath).stdout);
  expect(inbox).toHaveLength(1);
  expect(inbox[0].content).toBe("hello");
  expect(inbox[0].id).toBe(id);

  runCli(["ack", String(id)], dbPath);
  expect(JSON.parse(runCli(["poll", "--as", "persona"], dbPath).stdout)).toHaveLength(0);

  const lines = runCli(["dump", "--jsonl"], dbPath).stdout.split("\n").filter(Boolean);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]).content).toBe("hello");

  rmSync(dir, { recursive: true, force: true });
});

test("CLI: an invalid kind exits non-zero with a clear message", () => {
  const dir = mkdtempSync(join(tmpdir(), "collab-cli-"));
  const dbPath = join(dir, "collab.db");

  const res = runCli(
    ["send", "--as", "coding", "--kind", "bogus", "--content", "x"],
    dbPath,
  );
  expect(res.exitCode).not.toBe(0);
  expect(res.stderr).toMatch(/invalid kind/i);

  rmSync(dir, { recursive: true, force: true });
});

test("concurrent writers from separate processes do not collide (WAL + busy_timeout)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "collab-conc-"));
  const dbPath = join(dir, "collab.db");
  runCli(["init"], dbPath); // create the schema before the stampede

  const N = 20;
  const procs = Array.from({ length: N }, (_, i) =>
    Bun.spawn(
      ["bun", "run", CLI, "send", "--as", "coding", "--kind", "question", "--content", `msg-${i}`],
      { env: { ...process.env, COLLAB_DB: dbPath, COLLAB_ID: "default" }, stdout: "pipe", stderr: "pipe" },
    ),
  );

  const exitCodes = await Promise.all(procs.map((p) => p.exited));
  expect(exitCodes.every((code) => code === 0)).toBe(true);

  const inbox = JSON.parse(runCli(["poll", "--as", "persona"], dbPath).stdout);
  expect(inbox).toHaveLength(N);

  rmSync(dir, { recursive: true, force: true });
});
