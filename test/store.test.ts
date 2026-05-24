import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageStore, type Kind, type Role } from "../src/store.ts";

function freshStore() {
  return MessageStore.open({ dbPath: ":memory:" });
}

function tmpDbDir() {
  return mkdtempSync(join(tmpdir(), "collab-"));
}

test("a sent message shows up in the recipient's inbox", () => {
  const store = freshStore();
  store.send({ as: "coding", kind: "question", content: "user id or api key?" });

  const inbox = store.poll({ as: "persona" });

  expect(inbox).toHaveLength(1);
  expect(inbox[0]!.content).toBe("user id or api key?");
  store.close();
});

test("send derives recipient as the other role and returns the created message", () => {
  const store = freshStore();

  const msg = store.send({ as: "persona", kind: "answer", content: "key on the API key" });

  expect(msg.id).toBeGreaterThan(0);
  expect(msg.sender).toBe("persona");
  expect(msg.recipient).toBe("coding");
  expect(msg.kind).toBe("answer");
  expect(msg.content).toBe("key on the API key");
  expect(msg.processedAt).toBeNull();
  store.close();
});

test("poll returns the caller's messages ordered by id and does not ack them", () => {
  const store = freshStore();
  store.send({ as: "coding", kind: "question", content: "first" });
  store.send({ as: "coding", kind: "question", content: "second" });

  const firstPoll = store.poll({ as: "persona" });
  expect(firstPoll.map((m) => m.content)).toEqual(["first", "second"]);

  // polling again returns the same messages — poll never acks
  const secondPoll = store.poll({ as: "persona" });
  expect(secondPoll.map((m) => m.id)).toEqual(firstPoll.map((m) => m.id));
  store.close();
});

test("poll excludes messages addressed to the other role", () => {
  const store = freshStore();
  store.send({ as: "coding", kind: "question", content: "for persona" });

  // the coding agent should NOT see its own outbound message in its inbox
  expect(store.poll({ as: "coding" })).toHaveLength(0);
  expect(store.poll({ as: "persona" })).toHaveLength(1);
  store.close();
});

test("ack marks a message processed so a later poll excludes it", () => {
  const store = freshStore();
  const msg = store.send({ as: "coding", kind: "question", content: "answer me" });

  store.ack(msg.id);

  expect(store.poll({ as: "persona" })).toHaveLength(0);
  store.close();
});

test("dump returns full history (incl. processed) by id, with reply links recorded", () => {
  const store = freshStore();
  const q = store.send({ as: "coding", kind: "question", content: "Q" });
  store.ack(q.id);
  store.send({ as: "persona", kind: "answer", content: "A", inReplyTo: q.id });

  const history = store.dump();

  expect(history.map((m) => m.content)).toEqual(["Q", "A"]);
  expect(history[0]!.processedAt).not.toBeNull(); // processed message is still in history
  expect(history[1]!.inReplyTo).toBe(q.id); // reply link recorded
  store.close();
});

test("send rejects an invalid kind with a clear error", () => {
  const store = freshStore();
  expect(() =>
    store.send({ as: "coding", kind: "bogus" as Kind, content: "x" }),
  ).toThrow(/invalid kind/i);
  store.close();
});

test("send rejects an invalid role with a clear error", () => {
  const store = freshStore();
  expect(() =>
    store.send({ as: "boss" as Role, kind: "question", content: "x" }),
  ).toThrow(/invalid role/i);
  store.close();
});

test("open is idempotent: reopening an existing db preserves schema and data", () => {
  const dir = tmpDbDir();
  const dbPath = join(dir, "collab.db");

  const first = MessageStore.open({ dbPath });
  first.send({ as: "coding", kind: "question", content: "persisted" });
  first.close();

  const second = MessageStore.open({ dbPath });
  expect(second.poll({ as: "persona" }).map((m) => m.content)).toEqual(["persisted"]);
  second.close();

  rmSync(dir, { recursive: true, force: true });
});

test("messages are scoped by collaboration id within a shared db file", () => {
  const dir = tmpDbDir();
  const dbPath = join(dir, "collab.db");
  const a = MessageStore.open({ dbPath, collaborationId: "A" });
  const b = MessageStore.open({ dbPath, collaborationId: "B" });

  a.send({ as: "coding", kind: "question", content: "scoped to A" });

  expect(b.poll({ as: "persona" })).toHaveLength(0);
  expect(b.dump()).toHaveLength(0);
  expect(a.poll({ as: "persona" })).toHaveLength(1);
  expect(a.dump()).toHaveLength(1);

  a.close();
  b.close();
  rmSync(dir, { recursive: true, force: true });
});
