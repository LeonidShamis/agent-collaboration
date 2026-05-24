import { test, expect } from "bun:test";
import { renderTimeline } from "../src/timeline.ts";
import type { Message } from "../src/store.ts";

function msg(over: Partial<Message>): Message {
  return {
    id: 1,
    collaborationId: "c",
    createdAt: "2026-05-24 06:42:38",
    sender: "coding",
    recipient: "persona",
    kind: "question",
    content: "hi",
    inReplyTo: null,
    processedAt: null,
    ...over,
  };
}

test("renders a coding message flush-left: header + content indented 4 (plain)", () => {
  const out = renderTimeline([msg({ id: 1, content: "Add rate limiting." })], { color: false });
  expect(out).toBe(
    "#1  coding → persona · question · 2026-05-24 06:42:38\n" + "    Add rate limiting.",
  );
});

test("renders a persona reply offset to the right, with a reply marker", () => {
  const out = renderTimeline(
    [
      msg({
        id: 2,
        sender: "persona",
        recipient: "coding",
        kind: "answer",
        inReplyTo: 1,
        createdAt: "2026-05-24 06:43:14",
        content: "Use an in-memory Map.",
      }),
    ],
    { color: false },
  );
  expect(out).toBe(
    "        #2  persona → coding · answer · ↩#1 · 2026-05-24 06:43:14\n" +
      "            Use an in-memory Map.",
  );
});

test("separates messages with a blank line, in order", () => {
  const out = renderTimeline(
    [msg({ id: 1, content: "q" }), msg({ id: 2, sender: "persona", recipient: "coding", kind: "answer", content: "a" })],
    { color: false },
  );
  const blocks = out.split("\n\n");
  expect(blocks).toHaveLength(2);
  expect(blocks[0]!.startsWith("#1")).toBe(true);
  expect(blocks[1]!.trimStart().startsWith("#2")).toBe(true);
});

test("indents every line of multi-line content", () => {
  const out = renderTimeline([msg({ id: 1, content: "line one\nline two" })], { color: false });
  expect(out).toBe(
    "#1  coding → persona · question · 2026-05-24 06:42:38\n" +
      "    line one\n" +
      "    line two",
  );
});

test("empty timeline renders a friendly placeholder", () => {
  expect(renderTimeline([], { color: false })).toBe("(no messages yet)");
});

test("color mode emits ANSI escapes; plain mode emits none", () => {
  const messages = [msg({ id: 1, content: "hi" })];
  const colored = renderTimeline(messages, { color: true });
  const plain = renderTimeline(messages, { color: false });

  expect(colored).toContain("\x1b["); // has ANSI
  expect(plain).not.toContain("\x1b["); // none
  // color must not change the visible text — strip ANSI and it equals plain
  expect(colored.replace(/\x1b\[[0-9;]*m/g, "")).toBe(plain);
});
