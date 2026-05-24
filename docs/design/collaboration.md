# Agent Collaboration — Design

> This is the working design doc / spec. It used to live in `CONTEXT.md`; that file
> is now the glossary (per this repo's conventions). **Add future spec points here**,
> not in `CONTEXT.md`.

## Vision

When a coding agent (Claude Code) asks the user a question mid-task, the user doesn't
always have the best answer — sometimes they lack the domain or technical depth. The
idea: capture the user in a `SOUL.md` (experience, skills, preferences, goals) and have
a second Claude Code process answer the coding agent's questions *as the user* — grounded
in the user's foundational knowledge and preferences, then **enhanced** by the model's
expert domain/technical knowledge.

The stand-in's primary value is **knowledge of the user** (goals, priorities, taste,
constraints, prior decisions) — the thing the asking agent genuinely cannot derive on its
own. Expertise is an *enhancer* layered on top, not the headline. In short: "the user,
made consistent and decisive, then sharpened by expert depth."

## Original spec points

1. Each agent runs as a Claude Code process that can be given an **additional** prompt on
   top of Claude Code's own system prompt, with `CLAUDE.md` still applied.
2. One process is a normal **Coding Agent**; the other carries the persona (`SOUL.md`).
3. The two processes communicate through a shared store — reliable, persistent, robust,
   simple, no external services/broker; a local CLI-driven store like SQLite is acceptable.
4. The processes monitor incoming messages from each other, handle them, and reply.
5. Collaboration happens within a session; start with one, plan for multiple concurrent
   later; one project directory per collaboration.
6. Keep all messages in the shared store for debugging (JSONL-style history).
7. The process representing the user uses the `SOUL.md` setup.
8. The user can type directly into the Persona process's prompt; that message is sent to
   the Coding Agent via the shared store.

## Resolved decisions

- **Additional system prompt (point 1):** Use `--append-system-prompt-file SOUL.md` (or the
  Agent SDK `systemPrompt: { type: "preset", preset: "claude_code", append: … }`). This
  appends to Claude Code's built-in system prompt; `CLAUDE.md` still layers on top as
  injected context. No custom mechanism needed.
- **Execution model (point 4):** Core Claude Code cannot watch files or run an event loop;
  it runs one turn and exits. Claude Code's **`/loop`** re-invokes a slash command on a
  recurring interval (≥60s; `/loop 1m` schedules a recurring job, observed cancelled via
  `CronDelete` on `done` / `/collab:stop`). A scheduled run fires only after the current turn
  completes. Each agent runs a slash command that starts a `/loop` poller over its inbox. No
  external orchestrator.
- **Both agents are interactive** (point 5 / Q2): the user runs both as interactive Claude
  Code processes and watches both consoles live; SQLite holds transport + full history.
- **Send rules:**
  - Coding Agent sends a message only when it is **blocked / has a question** (the moment it
    would otherwise stop for the human).
  - Persona Agent **answers every** inbound message, and **relays** messages the human types
    directly into its prompt.
- **Shared store (point 3 + 6):** a single **SQLite** database in the collaboration
  directory, serving both live transport and full history (collapses points 3 and 6).
  Accessed via a small bun/TypeScript CLI that the polling skill calls. Chosen over
  file-per-message and append-only JSONL for ACID + free concurrency handling. See
  [ADR-0001](../adr/0001-sqlite-shared-store.md).
- **Message schema:** one `messages` table:

  ```sql
  CREATE TABLE messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,   -- also gives total ordering
    collaboration_id TEXT    NOT NULL,                    -- future-proofs concurrency (point 5)
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    sender           TEXT    NOT NULL CHECK (sender    IN ('coding','persona')),
    recipient        TEXT    NOT NULL CHECK (recipient IN ('coding','persona')),
    kind             TEXT    NOT NULL CHECK (kind IN ('question','answer','direct','control')),
    content          TEXT    NOT NULL,
    in_reply_to      INTEGER REFERENCES messages(id),     -- threads an answer to its question
    processed_at     TEXT                                  -- NULL = still in recipient's Inbox
  );
  ```

  - Inbox poll: `… WHERE recipient = :me AND processed_at IS NULL AND collaboration_id = :c ORDER BY id`
  - Mark handled: `UPDATE … SET processed_at = datetime('now') WHERE id = :id`
  - History dump: `… WHERE collaboration_id = :c ORDER BY id` → JSONL on demand.
  - `kind`: `question` (Coding asks), `answer` (Persona replies), `direct` (human typed into
    Persona, relayed), `control` (lifecycle signals, e.g. "done").

- **Lifecycle:**
  - *Bootstrap:* the user types the task directly into the **Coding Agent** (the worker).
    Point 8 (typing into the Persona) is for mid-flight steering, not kickoff.
  - *Reactive loop:* on each poll an agent processes any unprocessed Inbox messages and
    otherwise idles. After sending a `question`, the Coding Agent simply has an empty Inbox
    until the `answer` arrives — "blocked" needs no special state.
  - *Termination:* the Coding Agent emits a `control` message (`"done"`) when it judges the
    task complete and stops its own loop; the Persona stops on receiving `done`. Both halt —
    clean mutual shutdown. A manual stop is always available: **`/collab:stop`** (a slash
    command, so it is never relayed — found in a stress smoke that prose "stop" gets relayed
    to the Coding Agent) or Ctrl-C. To steer after `done`, re-arm the loop(s).
  - *Runaway guard:* **none automated for now** — the user monitors both consoles and
    interrupts from either prompt if needed.
  - *Planned enhancement:* replace manual watching with **goal-based termination** — define
    an objective to check progress against (Claude Code's `/goal`,
    <https://code.claude.com/docs/en/goal>) instead of an arbitrary message/time cap.

- **Directory topology:**
  - Message Store at a fixed absolute path, `<project>/.collab/collab.db` (gitignored),
    handed to both processes via the `COLLAB_DB` env var (set at launch → survives every
    `/loop` re-invocation). Role likewise scoped per process.
  - **Coding Agent** runs in the real **project directory** and edits code normally.
  - **Persona Agent** runs in **its own directory, blind** (no codebase access) — it answers
    purely from the incoming question + `SOUL.md` + the running thread, launched with
    `--append-system-prompt-file SOUL.md`. This isolates the variable we care about (does
    `SOUL.md` capture the user?) and forces the Coding Agent to ask **self-contained**
    questions.
  - *Planned path to a code-aware Persona:* since the user trusts the Coding Agent for all
    edits, the only enhancement needed is a **read-only** pointer to where the code lives.

- **Packaging — a Claude Code plugin (ADR-0002):** the whole capability is a plugin (this
  repo *is* the plugin: `.claude-plugin/plugin.json`, `bin/`, `commands/`, `hooks/`, CLI in
  `src/`). Each agent enables it in its own directory with `claude --plugin-dir <repo>`,
  which puts a `bin/collab` wrapper on the Bash `PATH` and provides the namespaced commands
  `/collab:coding-watch` and `/collab:persona-watch`. This is what lets the blind Persona —
  in its own code-free directory — still reach the CLI.
- **Interface boundary:** the only user-facing surface is **slash commands** (and Claude
  Code **hooks**). The `collab` CLI is internal plumbing — never invoked directly at the
  prompt; the command runs it via Bash. Plugins **cannot** grant permissions, so each agent
  directory's `.claude/settings.json` allowlists `Bash(collab:*)` so the `/loop` poll runs
  unattended; hook-invoked CLI calls run unsandboxed and need no allowlist.
- **`collab` CLI (bun/TypeScript), reads `COLLAB_DB` from env:**
  - `collab init` — create DB + `messages` table if missing
  - `collab send --as <role> --kind <k> --content <text> [--in-reply-to <id>]` — enqueue to
    the other agent; prints new id
  - `collab poll --as <role>` — print unprocessed messages for `<role>` as JSON (no ack)
  - `collab ack <id>` — mark processed
  - `collab dump [--jsonl] [--all]` — full history as JSON (`--all` ignores `collaboration_id`)
  - `collab show [--follow] [--all]` — chat-style timeline (TTY-colored, plain when piped);
    `--follow` tails live
- **Two role-specific slash commands** (chosen over one shared skill — role confusion would
  be catastrophic, so the role is explicit in the command itself):
  - `/collab:coding-watch` (armed via `/loop 1m /collab:coding-watch`): poll → print → continue the task
    in-session with the message as input → on a question `collab send … --kind question`;
    on completion `collab send … --kind control --content done` → `ack`.
  - `/collab:persona-watch` (armed via `/loop 1m /collab:persona-watch`): poll → print → answer as the
    user (`SOUL.md` is in the system prompt) → `collab send … --kind answer --in-reply-to`
    → `ack`.
- **Idempotency:** `ack` after the response is sent (at-least-once); a scheduled poll never
  interrupts an in-flight turn, so no double-processing in normal operation.
- **Protocol delivery (clarified in #2):** the Coding Agent's collaboration protocol
  ("route questions through `collab` when blocked; send `control done` when complete") lives
  **inside the `/collab:coding-watch` command**, which `/loop` re-injects every tick — so it stays
  ambient across all turns without a launch-time system prompt (the Coding Agent remains
  plain Claude Code, per point 2). This makes the startup order load-bearing.
- **Startup order:** arm the watcher(s) **first** (`/loop 1m /collab:coding-watch`) so the protocol
  is in context, **then** type the task into the Coding Agent.

- **Persona's two input paths (independent):**
  - *Automatic answering — the dominant mode:* `/loop 1m /collab:persona-watch` polls the Inbox and
    auto-replies to the Coding Agent. Runs regardless of whether the human is present.
  - *Occasional course-correction:* a **`UserPromptSubmit` hook on the Persona only** catches
    free-text the human types, runs `collab send --as persona --kind direct`, **blocks** the
    local turn (the Persona never "answers" the human's own words), and shows a
    `systemMessage` ("→ forwarded to Coding Agent"). Verbatim relay (not re-voiced) — the
    `direct` kind tells the Coding Agent the human spoke literally. `UserPromptSubmit` *does*
    fire for slash commands, so the hook **skips command-style input** (anything starting with
    `/` or `!`) itself — otherwise it would relay + block the watch commands and break the
    loop (found in a live smoke; see ADR/PR). The Coding Agent has **no** such hook — free-text
    there is how the human types the task.
- **Bonus hooks:** `SessionStart` → `collab init` (DB always exists, no manual init);
  optional `PreToolUse` deny on Edit/Write to keep the Persona strictly read-only.

## Persona autonomy (resolved)

- The Persona is **maximally autonomous**: it always returns its best answer grounded in
  `SOUL.md` + frontier-model knowledge, for *every* Coding Agent message, designed to run
  unattended for long stretches. **No escalation gate, no flag-and-wait.**
- The human's only intervention is **reactive course-correction** via direct input.
- Caution about **irreversible/destructive** decisions therefore lives *inside* `SOUL.md` as
  a stated risk posture (a preference the Persona applies autonomously), not as a separate
  mechanism. The Persona only ever produces *text answers* — the real backstop for executing
  anything destructive is the **Coding Agent's own permission mode**.
- `SOUL.md` is **project-specific**: the user passes a standard `SOUL.md` and customizes per
  project as needed.

## SOUL.md (resolved)

- **No schema** — freeform markdown appended via `--append-system-prompt-file SOUL.md`.
  Nothing parses it for headings; reorder/rename/merge/drop freely without breaking anything.
- **Starter template (non-binding), six decision-shaping parts:**
  1. Operating principles / taste (defaults, heuristics)
  2. Priorities & anti-goals
  3. Technical preferences & boundaries (stack, patterns, always-wants)
  4. Project / domain context (constraints, users, external commitments)
  5. Decision principles & **risk posture** for irreversible/destructive actions (the
     in-`SOUL.md` substitute for an escalation gate)
  6. Voice (terse vs. detailed)
- **Behavior lives in `/collab:persona-watch`, not `SOUL.md`:** answer as the user; produce answers
  the Coding Agent can act on; **annotate confidence/assumptions** when `SOUL.md` doesn't
  clearly cover a question (e.g. "Answer: X. (Low confidence — assumed Y.)") — never blocks,
  just makes reactive monitoring efficient. This keeps `SOUL.md` swappable.

## Message content guidelines (resolved)

- **Coding Agent → self-contained questions** (the Persona is blind): carry the file/path,
  the relevant snippet, the options considered, and the specific decision needed — never a
  context-free "which approach here?". Lives in `/collab:coding-watch`.
- **Persona → directly actionable answers**: a clear decision + brief rationale in the
  user's voice, plus the confidence annotation when uncertain, so the Coding Agent can act
  without another round. Lives in `/collab:persona-watch`.

## Minor decisions (resolved)

- **Poll interval = 1 min** (the `/loop` minimum recurring interval).
- **`collaboration_id`** = a shared `COLLAB_ID` env var passed identically to both processes,
  default `"default"` for v1; multi-collaboration later = more IDs / more DB files.
- **SQLite hardening:** WAL mode + `busy_timeout` (~5s) so the two processes never collide
  on a lock.

## Status

**Design complete.** All 8 original spec points are resolved above. Glossary in
[`CONTEXT.md`](../../CONTEXT.md); store rationale in [`ADR-0001`](../adr/0001-sqlite-shared-store.md).
Next: break into build issues via `/to-issues`.
- How the Persona handles direct human input — relay verbatim vs. re-voice.
- `SOUL.md` content/structure, and when the Persona should defer to the real human
  (irreversible / high-stakes decisions).
- Bootstrap: the two slash commands, directory layout, sessions/concurrency hooks.
