import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../src/cli.ts");

// Deterministic stand-ins for the watcher commands' CLI calls. The agent's
// *reasoning* (what question to ask, when it's done) is simulated here; the
// machinery exercised — poll oldest-first, ack-after-send, reply threading,
// control:done termination — is exactly what /coding-watch and /persona-watch
// rely on.

interface Msg {
  id: number;
  kind: string;
  sender: string;
  recipient: string;
  content: string;
  inReplyTo: number | null;
  processedAt: string | null;
}

function run(args: string[], dbPath: string): string {
  const proc = Bun.spawnSync(["bun", "run", CLI, ...args], {
    env: { ...process.env, COLLAB_DB: dbPath, COLLAB_ID: "default" },
  });
  if (proc.exitCode !== 0) {
    throw new Error(`collab ${args.join(" ")} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

function send(
  dbPath: string,
  as: string,
  kind: string,
  content: string,
  inReplyTo?: number,
): number {
  const args = ["send", "--as", as, "--kind", kind, "--content", content];
  if (inReplyTo !== undefined) args.push("--in-reply-to", String(inReplyTo));
  return Number(run(args, dbPath));
}

function poll(dbPath: string, as: string): Msg[] {
  return JSON.parse(run(["poll", "--as", as], dbPath));
}

function ack(dbPath: string, id: number): void {
  run(["ack", String(id)], dbPath);
}

function dump(dbPath: string): Msg[] {
  return JSON.parse(run(["dump"], dbPath));
}

test("a full collaboration session runs through the message protocol end-to-end", () => {
  const dir = mkdtempSync(join(tmpdir(), "collab-session-"));
  const dbPath = join(dir, "collab.db");
  run(["init"], dbPath);

  // Coding got its task, hit a question, and (per send rule) emits it.
  const q1 = send(dbPath, "coding", "question", "user id or api key?");

  // Persona step: process its inbox oldest-first, answer, ack.
  const personaInbox1 = poll(dbPath, "persona");
  expect(personaInbox1.map((m) => m.id)).toEqual([q1]);
  const a1 = send(dbPath, "persona", "answer", "API key.", personaInbox1[0]!.id);
  ack(dbPath, personaInbox1[0]!.id);
  expect(poll(dbPath, "persona")).toHaveLength(0); // acked → inbox empty

  // Coding step: consume the answer, still blocked → ask again, ack.
  const codingInbox1 = poll(dbPath, "coding");
  expect(codingInbox1.map((m) => m.id)).toEqual([a1]);
  const q2 = send(dbPath, "coding", "question", "in-memory or persistent cache?", codingInbox1[0]!.id);
  ack(dbPath, codingInbox1[0]!.id);

  // Persona step: answer Q2, ack.
  const personaInbox2 = poll(dbPath, "persona");
  expect(personaInbox2.map((m) => m.id)).toEqual([q2]);
  send(dbPath, "persona", "answer", "Persistent.", personaInbox2[0]!.id);
  ack(dbPath, personaInbox2[0]!.id);

  // Coding step: consume final answer, task complete → control:done, ack.
  const codingInbox2 = poll(dbPath, "coding");
  expect(codingInbox2[0]!.kind).toBe("answer");
  send(dbPath, "coding", "control", "done");
  ack(dbPath, codingInbox2[0]!.id);

  // Persona step: sees the done signal and stops (acks it).
  const personaInbox3 = poll(dbPath, "persona");
  expect(personaInbox3.map((m) => m.kind)).toEqual(["control"]);
  ack(dbPath, personaInbox3[0]!.id);

  // The whole thread is recorded in order, with reply links, and everything is processed.
  const history = dump(dbPath);
  expect(history.map((m) => m.kind)).toEqual(["question", "answer", "question", "answer", "control"]);
  expect(history[1]!.inReplyTo).toBe(q1); // A1 threads to Q1
  expect(history[2]!.inReplyTo).toBe(a1); // Q2 threads to A1
  expect(history.every((m) => m.processedAt !== null)).toBe(true);

  // Both inboxes drained at the end of the collaboration.
  expect(poll(dbPath, "coding")).toHaveLength(0);
  expect(poll(dbPath, "persona")).toHaveLength(0);

  rmSync(dir, { recursive: true, force: true });
});
