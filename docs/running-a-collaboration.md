# Running a collaboration

The collab capability is a **Claude Code plugin** (this repo *is* the plugin). Each agent
enables it independently in its own working directory, so the same capability drops into any
project. As of `#3` the round-trip is **fully hands-off**: a real Coding Agent and a real
autonomous Persona Agent collaborate with no human in the loop (you just watch). Hand-playing
the Persona from a shell remains available as a fallback.

## One-time (dev) setup

```bash
bun install   # dev/test deps only; the bundled CLI itself is dependency-free
```

The Message Store is created automatically on first use (`COLLAB_DB` sets its path;
`COLLAB_ID` sets the collaboration id, default `"default"`). Pick one **absolute**
`COLLAB_DB` path and use it for *every* process in the collaboration.

## Enabling the plugin in an agent

Launch a Claude Code session with the plugin attached and the collaboration env set:

```bash
COLLAB_DB=/abs/path/to/collab.db COLLAB_ROLE=coding \
  claude --plugin-dir /abs/path/to/agent-collaboration
```

- `--plugin-dir` enables the plugin → the `collab` CLI is on the Bash `PATH` and the
  `/collab:coding-watch` command is available.
- `COLLAB_ROLE` (`coding` | `persona`) is read by role-scoped hooks (added in later slices).

Because plugins cannot grant permissions, add an allowlist to **that agent directory's**
`.claude/settings.json` so the `/loop` poll runs unattended:

```json
{ "permissions": { "allow": ["Bash(collab:*)"] } }
```

## Hands-off round-trip (`#3`: autonomous Persona)

Two Claude Code sessions, same `COLLAB_DB`, both with the plugin enabled.

**Terminal A — the Coding Agent**, in the project you want worked on:

```bash
cd /abs/path/to/your-project
# .claude/settings.json here allowlists Bash(collab:*)
COLLAB_DB=/abs/path/to/your-project/.collab/collab.db COLLAB_ROLE=coding \
  claude --plugin-dir /abs/path/to/agent-collaboration
```
1. Arm the loop **first** so the protocol is in context before the task:
   `/loop 1m /collab:coding-watch`
2. Then type the task, e.g. *"Add a rate limiter to the API."*

**Terminal B — the Persona Agent**, in its own **code-free** directory (blind), with a
`SOUL.md` to answer as you:

```bash
mkdir -p ~/persona && cd ~/persona
cp /abs/path/to/agent-collaboration/examples/SOUL.example.md ./SOUL.md   # then edit to be you
# .claude/settings.json here also allowlists Bash(collab:*)
COLLAB_DB=/abs/path/to/your-project/.collab/collab.db COLLAB_ROLE=persona \
  claude --plugin-dir /abs/path/to/agent-collaboration --append-system-prompt-file ./SOUL.md
```
1. Arm the loop: `/loop 1m /collab:persona-watch`

Now watch: the Coding Agent asks → the Persona auto-answers as you (grounded in `SOUL.md`) →
the Coding Agent continues → … → `control done`. No human input required.

### What this verifies

- The Persona auto-answers **every** question, grounded in `SOUL.md`, with actionable
  decisions in your voice — no escalation gate, no human in the loop.
- The Coding Agent consumes those answers, continues in-session, and the run terminates on
  `control done`.
- Both `/loop` polls run unattended (per-agent `Bash(collab:*)` allowlist).

The deterministic machinery behind the loop (oldest-first delivery, ack-after-send, reply
threading, `control:done` termination) is covered automatically by `test/session.test.ts`.

## Course-correction: steer the Coding Agent through the Persona (`#4`)

While the collaboration runs, type **prose** into the **Persona Agent's** prompt to inject a
message to the Coding Agent — e.g. *"also add a metrics counter"*. A `UserPromptSubmit` hook
(shipped with the plugin) relays it verbatim as a `direct` message and suppresses the local
turn, confirming with *"→ forwarded to Coding Agent"*. The Coding Agent picks it up on its
next tick and acts on it with your authority.

- This is occasional steering; the Persona's dominant mode is still auto-answering.
- **Slash commands are not relayed** — they bypass `UserPromptSubmit`, so `/loop`,
  `/collab:persona-watch`, etc. work normally.
- The hook self-scopes by `COLLAB_ROLE`, so it only fires for the Persona; the Coding Agent's
  prompts (including the initial task) pass through untouched. No extra setup — hooks run
  unsandboxed, so no allowlist entry is needed for the relay itself.

## Fallback: hand-playing the Persona (no second agent)

Drive the Persona from a plain shell (the `collab` bin is only on `PATH` inside a
plugin-enabled Claude session, so call the CLI directly with the **same** `COLLAB_DB`):

```bash
export COLLAB_DB=/abs/path/to/your-project/.collab/collab.db
alias collab='bun /abs/path/to/agent-collaboration/src/cli.ts'

collab poll --as persona                                  # see open questions
collab send --as persona --kind answer --in-reply-to <id> --content "…your decision…"
collab ack <id>                                           # mark it handled
collab dump --jsonl                                       # watch the whole exchange
```
