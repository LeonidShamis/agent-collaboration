import type { Message, Role } from "./store.ts";

// Indent each speaker to its own side, chat-style: Coding flush-left, Persona offset.
const HEADER_INDENT: Record<Role, number> = { coding: 0, persona: 8 };
const CONTENT_EXTRA = 4;
const ROLE_COLOR: Record<Role, string> = { coding: "36", persona: "35" }; // cyan / magenta

function paint(code: string, s: string, on: boolean): string {
  return on ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function renderMessage(m: Message, color: boolean): string {
  const headIndent = " ".repeat(HEADER_INDENT[m.sender]);
  const bodyIndent = " ".repeat(HEADER_INDENT[m.sender] + CONTENT_EXTRA);
  const reply = m.inReplyTo ? ` · ↩#${m.inReplyTo}` : "";
  const main = `#${m.id}  ${m.sender} → ${m.recipient}`;
  const meta = ` · ${m.kind}${reply} · ${m.createdAt}`;
  const header = paint(ROLE_COLOR[m.sender], main, color) + paint("2", meta, color); // meta dimmed
  const body = m.content
    .split("\n")
    .map((line) => bodyIndent + line)
    .join("\n");
  return headIndent + header + "\n" + body;
}

// Render a collaboration as a chat-style timeline. Pure and deterministic.
// `color` adds ANSI styling without changing the visible text (strip ANSI → plain output).
export function renderTimeline(messages: Message[], opts: { color?: boolean } = {}): string {
  if (messages.length === 0) return "(no messages yet)";
  const color = opts.color ?? false;
  return messages.map((m) => renderMessage(m, color)).join("\n\n");
}
