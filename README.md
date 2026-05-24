# collab — Coding Agent ↔ Persona Agent collaboration

[![tests](https://github.com/LeonidShamis/agent-collaboration/actions/workflows/tests.yml/badge.svg)](https://github.com/LeonidShamis/agent-collaboration/actions/workflows/tests.yml)
[![plugin](https://img.shields.io/badge/plugin-v0.1.0-blue)](https://github.com/LeonidShamis/agent-collaboration/blob/main/.claude-plugin/plugin.json)

A Claude Code plugin that lets a coding agent collaborate with **you** — even when you're not
there. When the coding agent hits a question it would normally stop and ask you, a *second*
Claude Code process answers **on your behalf**, grounded in a `SOUL.md` that captures your
experience, preferences, goals, and decision principles. You watch the two agents work
through a task hands-off, and step in only when you want to.

The stand-in's value is **knowledge of you** (taste, priorities, constraints, prior
decisions) — the thing the asking agent can't derive on its own — enhanced by the model's own
expertise. In short: *you, made consistent and decisive, then sharpened by expert depth.*

## How it works

Two interactive Claude Code processes, each with this plugin enabled, communicate through a
shared **SQLite message bus**:

```
  ┌─────────────────┐        SQLite store         ┌──────────────────┐
  │  Coding Agent   │  ── question ──▶  collab.db  ── question ──▶    │  Persona Agent   │
  │  (does the work)│  ◀── answer ───            ◀── answer ───      │  (answers as you │
  │                 │                                                 │   via SOUL.md)   │
  └─────────────────┘                                                 └──────────────────┘
       /collab:coding-watch                                      /collab:persona-watch
```

- Each agent runs a watch command on a recurring **`/loop`**, polling its inbox each tick.
- The **Coding Agent**, when blocked, sends a self-contained `question` instead of stopping;
  the **Persona Agent** auto-answers *every* question, grounded in `SOUL.md`.
- When the task is complete the Coding Agent sends `done` and **both loops stop**.
- You can **course-correct** at any time by typing prose into the Persona (it's relayed to
  the Coding Agent), and **stop** either side with `/collab:stop`.

See **[`docs/running-a-collaboration.md`](./docs/running-a-collaboration.md)** for the full
walkthrough, and **[`docs/design/collaboration.md`](./docs/design/collaboration.md)** for the
design rationale.

## Requirements

- **[bun](https://bun.sh)** — the `collab` CLI is plain TypeScript on bun and uses the
  built-in `bun:sqlite` (no external dependencies).
- **[Claude Code](https://code.claude.com)** — two sessions, with the **`/loop`** recurring-
  command capability for the watch loops. (No `/loop`? Re-run the watch command manually each
  interval instead.) The watch interval is **≥60s** (`/loop 1m` schedules a recurring job),
  so a round-trip is ~1–2 min.

## Install

The repo is both the **plugin** and a single-plugin **marketplace** (`.claude-plugin/plugin.json`
+ `.claude-plugin/marketplace.json`), so either install path works.

### Via the marketplace (recommended)

```text
/plugin marketplace add LeonidShamis/agent-collaboration
/plugin install collab@agent-collaboration
```

`collab` is the plugin; `agent-collaboration` is the marketplace name. This is repeatable per
machine and survives across sessions. (Non-interactive equivalents: `claude plugin marketplace
add …`, `claude plugin install collab@agent-collaboration`.)

> **Private repo:** this repo is private, so a collaborator must have **repo access and git
> auth** (an SSH key or `gh` login that can clone it) for `/plugin marketplace add` to fetch
> it. Invite them on GitHub first.

### From a local clone (development, or no GitHub access)

```bash
git clone <this-repo> agent-collaboration
cd agent-collaboration
bun install                                   # dev/test deps only; the bundled CLI is dependency-free
claude --plugin-dir /abs/path/to/agent-collaboration
```

Either way, enabling the plugin puts the `collab` CLI on the Bash `PATH` and registers the
commands and hooks. (The CLI is dependency-free, so a marketplace install needs no `bun
install` — only [bun](https://bun.sh) on the machine.)

## Configure

**Environment variables** (set at launch for each agent):

| Variable | Purpose | Default |
|---|---|---|
| `COLLAB_DB` | Absolute path to the shared SQLite store. **Both agents must use the same path.** | `.collab/collab.db` (cwd-relative) |
| `COLLAB_ID` | Collaboration id — scopes a run. **Both agents must match.** Use distinct ids for concurrent collaborations. | `default` |
| `COLLAB_ROLE` | `coding` or `persona` — scopes the role-specific hooks (relay + read-only fire only for `persona`). | — |

**Per-agent permission allowlist.** Plugins can't grant permissions, so each agent
directory needs a `.claude/settings.json` so the unattended `/loop` poll doesn't prompt:

```json
{ "permissions": { "allow": ["Bash(collab:*)"] } }
```

**The Persona's `SOUL.md`.** Launch the Persona with your `SOUL.md` appended to its system
prompt; start from [`examples/SOUL.example.md`](./examples/SOUL.example.md):

```bash
claude --plugin-dir /abs/path/to/agent-collaboration --append-system-prompt-file ./SOUL.md
```

## Quick start (hands-off round-trip)

Two terminals sharing one `COLLAB_DB` + `COLLAB_ID`:

```bash
# Terminal 1 — Coding Agent, in the project you want worked on
cd /abs/path/to/your-project          # needs .claude/settings.json with Bash(collab:*)
COLLAB_DB="$PWD/.collab/collab.db" COLLAB_ID=feature-x COLLAB_ROLE=coding \
  claude --plugin-dir /abs/path/to/agent-collaboration
#   in-session:  /loop 1m /collab:coding-watch      (arm FIRST, then type the task)

# Terminal 2 — Persona Agent, in its own code-free dir holding your SOUL.md
cd /abs/path/to/persona-dir           # needs .claude/settings.json with Bash(collab:*)
COLLAB_DB=/abs/path/to/your-project/.collab/collab.db COLLAB_ID=feature-x COLLAB_ROLE=persona \
  claude --plugin-dir /abs/path/to/agent-collaboration --append-system-prompt-file ./SOUL.md
#   in-session:  /loop 1m /collab:persona-watch
```

Then type a task into Terminal 1 and watch them collaborate.

## Commands

| Command | Role | What it does |
|---|---|---|
| `/collab:coding-watch` | Coding Agent | Per `/loop` tick: deliver inbox messages as task input, route questions to the Persona, signal `done` when complete. |
| `/collab:persona-watch` | Persona Agent | Per `/loop` tick: autonomously answer every question **as the user** (grounded in `SOUL.md`), with a confidence flag when `SOUL.md` doesn't cover it. |
| `/collab:stop` | either | Cleanly stop this agent's watch loop. (A slash command, so it's never relayed — use this, not prose, to stop the Persona.) |

## Hooks (active when the plugin is enabled)

- **`SessionStart`** → runs `collab init` so the store always exists.
- **`UserPromptSubmit`** (Persona only) → relays free-text you type to the Coding Agent as a
  `direct` message and suppresses the local turn. Skips command-style input (`/…`, `!…`).
- **`PreToolUse`** (Persona only) → denies file-editing tools, keeping the Persona read-only.

The role-scoped hooks self-gate on `COLLAB_ROLE`, so they no-op for the Coding Agent.

## The `collab` CLI

Internal plumbing — invoked by the commands and hooks, not meant for the prompt — but useful
for inspecting a run. It reads `COLLAB_DB` / `COLLAB_ID` from the environment:

```bash
collab init                                              # create the store (idempotent)
collab send --as <role> --kind <k> --content <text> [--in-reply-to <id>]
collab poll --as <role>                                  # unprocessed messages for <role> (JSON)
collab ack <id>                                          # mark processed
collab dump [--jsonl] [--all]                            # full history as JSON (--all ignores COLLAB_ID)
collab show [--follow] [--all]                           # chat-style timeline; --follow tails live
```

`<role>` ∈ `coding | persona`; `<k>` ∈ `question | answer | direct | control`.

**Watching a run.** `collab show` is the friendly view — a chat-style timeline (Coding
flush-left, Persona indented, colored by role). It auto-detects a terminal: colored when
shown directly, plain when piped, so paging works cleanly:

```bash
collab show                 # colored timeline (scoped to COLLAB_ID)
collab show | less -R       # page through long history (use less -R to keep colors)
collab show --follow        # live tail — stream new messages until Ctrl-C
```

> Debugging tip: if `show`/`dump` is empty, you're scoped to the wrong `COLLAB_ID` — add
> `--all` to see every collaboration in the store. Outside a plugin-enabled session the bare
> `collab` isn't on `PATH`; call it as `bun /abs/path/to/agent-collaboration/src/cli.ts`.

## `SOUL.md`

Freeform markdown appended to the Persona's system prompt — **no schema**, reorder or trim
freely. The starter ([`examples/SOUL.example.md`](./examples/SOUL.example.md)) suggests six
decision-shaping parts: operating principles/taste · priorities & anti-goals · technical
preferences & boundaries · project/domain context · decision principles & risk posture ·
voice. The Persona's *behaviour* (answer as the user, annotate confidence) lives in
`/collab:persona-watch`, so `SOUL.md` stays purely your content and is swappable per project.

## Message model

One SQLite table, serving both live transport and full history. Messages have a `sender` and
`recipient` (`coding`/`persona`), a `kind` (`question`/`answer`/`direct`/`control`), optional
`in_reply_to` threading, and a `processed_at` (an unprocessed message = in the recipient's
inbox). Scoped by `collaboration_id`. See
[ADR-0001](./docs/adr/0001-sqlite-shared-store.md) for why SQLite.

## Notes & limitations

- **≥60s loop interval** (`/loop` schedules a recurring job, min ~1 min) — collaboration is
  deliberate, not snappy.
- **Termination is manual:** `done` stops both loops, or stop with `/collab:stop` / Ctrl-C.
  Goal-based termination (Claude Code `/goal`) is a planned enhancement.
- **The Persona is "blind"** by default (its own code-free directory) — it answers from the
  question + `SOUL.md`, which is why the Coding Agent must ask self-contained questions.
- Agent *behaviour* (does the model follow the prompts, does the Persona sound like you) is
  validated by live smoke runs, documented in `docs/running-a-collaboration.md`; the
  deterministic plumbing is covered by the test suite.

## Development

```bash
bun test            # the collab CLI + hook scripts + a full-session harness
bun run typecheck   # tsc --noEmit
```

Tests live in `test/`; the CLI in `src/` (`store.ts` is a deep module behind the thin
`cli.ts`); hook scripts in `scripts/`; commands in `commands/`; hooks in `hooks/hooks.json`.

Project documentation:

- **[`CONTEXT.md`](./CONTEXT.md)** — the domain glossary.
- **[`docs/design/collaboration.md`](./docs/design/collaboration.md)** — the full resolved design/spec.
- **[`docs/adr/`](./docs/adr/)** — architecture decisions (SQLite store; plugin packaging).
- **[`docs/running-a-collaboration.md`](./docs/running-a-collaboration.md)** — launch + smoke guide.

### Agent skills (this repo's dev environment)

This repo is itself developed with a set of engineering/productivity skills installed via the
[`skills`](https://github.com/vercel-labs/skills) CLI, pinned in
[`skills-lock.json`](./skills-lock.json) (sourced from
[`mattpocock/skills`](https://github.com/mattpocock/skills)). The materialized skill files
under `.claude/skills/` and `.agents/skills/` are **gitignored** — regenerable from the
lockfile. Restore them on a fresh clone with:

```bash
npx skills install      # recreates .claude/skills/ and .agents/skills/ from skills-lock.json
```

Add a skill (updates the lockfile) with `npx skills add mattpocock/skills`. Repo-specific
settings the skills read live in [`CLAUDE.md`](./CLAUDE.md) and
[`docs/agents/`](./docs/agents/) (issue tracker, triage labels, domain-doc layout).
