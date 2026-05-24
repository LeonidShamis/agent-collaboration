import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageStore } from "../src/store.ts";

const SCRIPT = join(import.meta.dir, "../scripts/relay-prompt.ts");

function runHook(payload: object, env: Record<string, string>) {
  const proc = Bun.spawnSync(["bun", "run", SCRIPT], {
    stdin: Buffer.from(JSON.stringify(payload)),
    env: { ...process.env, ...env },
  });
  return { stdout: proc.stdout.toString().trim(), exitCode: proc.exitCode };
}

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "collab-relay-"));
  return { dir, dbPath: join(dir, "collab.db") };
}

test("Persona: a typed prompt is relayed to the Coding Agent as a direct message, and the turn is blocked", () => {
  const { dir, dbPath } = freshDb();

  const res = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "also add a metrics counter" },
    { COLLAB_DB: dbPath, COLLAB_ROLE: "persona" },
  );

  const store = MessageStore.open({ dbPath });
  const codingInbox = store.poll({ as: "coding" });
  expect(codingInbox).toHaveLength(1);
  expect(codingInbox[0]!.kind).toBe("direct");
  expect(codingInbox[0]!.sender).toBe("persona");
  expect(codingInbox[0]!.content).toBe("also add a metrics counter");
  store.close();

  expect(res.exitCode).toBe(0);
  expect(JSON.parse(res.stdout).decision).toBe("block");

  rmSync(dir, { recursive: true, force: true });
});

test("Coding Agent: the hook is a no-op — nothing relayed, nothing blocked", () => {
  const { dir, dbPath } = freshDb();

  const res = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "build the rate limiter" },
    { COLLAB_DB: dbPath, COLLAB_ROLE: "coding" },
  );

  // no message produced in either inbox
  const store = MessageStore.open({ dbPath });
  expect(store.dump()).toHaveLength(0);
  store.close();

  // prompt passes through (no block decision emitted)
  expect(res.exitCode).toBe(0);
  expect(res.stdout).toBe("");

  rmSync(dir, { recursive: true, force: true });
});

test("Persona: a slash command is NOT relayed — it must execute normally", () => {
  const { dir, dbPath } = freshDb();

  const res = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "/loop 1m /collab:persona-watch" },
    { COLLAB_DB: dbPath, COLLAB_ROLE: "persona" },
  );

  const store = MessageStore.open({ dbPath });
  expect(store.dump()).toHaveLength(0); // not relayed
  store.close();

  expect(res.exitCode).toBe(0);
  expect(res.stdout).toBe(""); // not blocked — the command runs
  rmSync(dir, { recursive: true, force: true });
});

test("Persona: a bang (!) bash-prefixed input is NOT relayed", () => {
  const { dir, dbPath } = freshDb();

  const res = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "!ls -la" },
    { COLLAB_DB: dbPath, COLLAB_ROLE: "persona" },
  );

  const store = MessageStore.open({ dbPath });
  expect(store.dump()).toHaveLength(0);
  store.close();
  expect(res.stdout).toBe("");
  rmSync(dir, { recursive: true, force: true });
});

test("Persona: an empty prompt is not relayed and not blocked", () => {
  const { dir, dbPath } = freshDb();

  const res = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "   " },
    { COLLAB_DB: dbPath, COLLAB_ROLE: "persona" },
  );

  const store = MessageStore.open({ dbPath });
  expect(store.dump()).toHaveLength(0);
  store.close();

  expect(res.exitCode).toBe(0);
  expect(res.stdout).toBe("");

  rmSync(dir, { recursive: true, force: true });
});
