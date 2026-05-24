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

The Message Store lives at `COLLAB_DB`; the plugin's `SessionStart` hook runs `collab init`
on launch so it always exists (no manual init). `COLLAB_ID` sets the collaboration id
(default `"default"`). Pick one **absolute** `COLLAB_DB` path and **the same `COLLAB_ID`**
for *every* process in the collaboration; use a distinct `COLLAB_ID` (or a distinct
`COLLAB_DB`) per concurrent collaboration.

## Enabling the plugin in an agent

Launch a Claude Code session with the plugin attached and the collaboration env set:

```bash
COLLAB_DB=/abs/path/to/collab.db COLLAB_ID=my-feature COLLAB_ROLE=coding \
  claude --plugin-dir /abs/path/to/agent-collaboration
```

- `--plugin-dir` enables the plugin → the `collab` CLI is on the Bash `PATH`, the
  `/collab:coding-watch` / `/collab:persona-watch` commands are available, and the plugin's
  hooks are active.
- `COLLAB_ROLE` (`coding` | `persona`) scopes the role-specific hooks: the `UserPromptSubmit`
  relay and the `PreToolUse` read-only guard fire **only** for `persona` (the Persona answers
  and messages — it never edits files); both are no-ops for `coding`.

Because plugins cannot grant permissions, add an allowlist to **that agent directory's**
`.claude/settings.json` so the `/loop` poll runs unattended:

```json
{ "permissions": { "allow": ["Bash(collab:*)"] } }
```

## Hands-off round-trip (`#3`: autonomous Persona)

Two Claude Code sessions, same `COLLAB_DB` and `COLLAB_ID`, both with the plugin enabled.

**Terminal A — the Coding Agent**, in the project you want worked on:

```bash
cd /abs/path/to/your-project
# .claude/settings.json here allowlists Bash(collab:*)
COLLAB_DB=/abs/path/to/your-project/.collab/collab.db COLLAB_ID=my-feature COLLAB_ROLE=coding \
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
COLLAB_DB=/abs/path/to/your-project/.collab/collab.db COLLAB_ID=my-feature COLLAB_ROLE=persona \
  claude --plugin-dir /abs/path/to/agent-collaboration --append-system-prompt-file ./SOUL.md
```
1. Arm the loop: `/loop 1m /collab:persona-watch`

Now watch: the Coding Agent asks → the Persona auto-answers as you (grounded in `SOUL.md`) →
the Coding Agent continues → … → `control done`. No human input required.

### Ending it

- **`control done` ends the collaboration:** the Coding Agent sends it and stops its loop;
  the Persona stops on receiving it. Both halt — clean mutual shutdown.
- **To stop manually anytime,** run **`/collab:stop`** in either session (it cancels that
  agent's watch loop). Use the command, **not** prose — on the Persona, prose is relayed to
  the Coding Agent, so typing "stop the loop" forwards it instead of stopping anything. Ctrl-C
  is the hard stop.
- **To steer after `done`,** re-arm the loop(s) and send a new message — `done` has already
  stopped them.

### What this verifies

- The Persona auto-answers **every** question, grounded in `SOUL.md`, with actionable
  decisions in your voice — no escalation gate, no human in the loop.
- The Coding Agent consumes those answers, continues in-session, and the run terminates on
  `control done`.
- Both `/loop` polls run unattended (per-agent `Bash(collab:*)` allowlist).

To see `SOUL.md` influence and the confidence flag (`#5`): ask the Persona something your
`SOUL.md` clearly covers (e.g. a stack/style choice) — you should get a plain, grounded
answer; then ask something it doesn't cover — the answer should still come back, but flagged
*"(Low confidence — SOUL.md doesn't address this; assumed …)"*. The flag never blocks; it
just marks calls worth reviewing.

The deterministic machinery behind the loop (oldest-first delivery, ack-after-send, reply
threading, `control:done` termination) is covered automatically by `test/session.test.ts`.

## Course-correction: steer the Coding Agent through the Persona (`#4`)

While the collaboration runs, type **prose** into the **Persona Agent's** prompt to inject a
message to the Coding Agent — e.g. *"also add a metrics counter"*. A `UserPromptSubmit` hook
(shipped with the plugin) relays it verbatim as a `direct` message and suppresses the local
turn, confirming with *"→ forwarded to Coding Agent"*. The Coding Agent picks it up on its
next tick and acts on it with your authority.

- This is occasional steering; the Persona's dominant mode is still auto-answering.
- **Command-style input is not relayed** — the hook skips anything starting with `/` or `!`
  (slash commands like `/loop`, `/collab:persona-watch`, and `!`-bash input), so they execute
  normally. Only genuine prose is forwarded.
- The hook self-scopes by `COLLAB_ROLE`, so it only fires for the Persona; the Coding Agent's
  prompts (including the initial task) pass through untouched. No extra setup — hooks run
  unsandboxed, so no allowlist entry is needed for the relay itself.

## Watching the exchange

The friendliest way to follow a run is **`collab show`** — a chat-style timeline (Coding
flush-left, Persona indented, colored by role). From a third terminal (or any shell), with the
**same `COLLAB_DB` + `COLLAB_ID`**:

```bash
export COLLAB_DB=/abs/path/to/your-project/.collab/collab.db
export COLLAB_ID=feature-x
alias collab='bun /abs/path/to/agent-collaboration/src/cli.ts'   # bare `collab` is only on PATH inside an agent

collab show              # the whole exchange (colored to a terminal, plain when piped)
collab show | less -R    # page through a long history (less -R keeps the colors)
collab show --follow     # live tail — stream new messages until Ctrl-C
```

`collab show --all` ignores `COLLAB_ID` (every collaboration in the store) — handy if `show`
looks empty because you're scoped to the wrong id.

## Fallback: hand-playing the Persona (no second agent)

Drive the Persona from a plain shell (call the CLI directly with the **same** `COLLAB_DB`
**and** `COLLAB_ID` — `poll`/`send` scope to `COLLAB_ID` and silently default to `"default"`):

```bash
export COLLAB_DB=/abs/path/to/your-project/.collab/collab.db
export COLLAB_ID=feature-x          # MUST match the collaboration's id
alias collab='bun /abs/path/to/agent-collaboration/src/cli.ts'

collab show                                               # read the exchange (chat timeline)
collab poll --as persona                                  # open questions (raw JSON)
collab send --as persona --kind answer --in-reply-to <id> --content "…your decision…"
collab ack <id>                                           # mark it handled
```

> Debugging tip: if `dump` shows nothing, you're almost certainly scoped to the wrong
> `COLLAB_ID`. Use `collab dump --all` to see everything in the store regardless of id.
