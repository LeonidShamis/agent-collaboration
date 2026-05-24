# Running a collaboration

The collab capability is a **Claude Code plugin** (this repo *is* the plugin). Each agent
enables it independently in its own working directory, so the same capability drops into any
project. As slices land, more of this becomes automatic. Today (`#1`, `#2`, `#10`) the
**Coding Agent** is real and the **Persona** is hand-simulated from a shell; `#3` makes the
Persona autonomous.

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

## Manual smoke (`#2`: Coding Agent loop, Persona hand-simulated)

**Terminal A — the Coding Agent** (plugin enabled, as above, in the project you want it to
work on):

1. Arm the watch loop **first** so the collaboration protocol is in context before the task:
   ```
   /loop 1m /collab:coding-watch
   ```
2. Then type the task, e.g. *"Add a rate limiter to the API."*
3. When stuck, instead of asking you at the prompt it runs `collab send --as coding --kind
   question …` and stops; each tick it polls and continues when an answer arrives; when done
   it sends `control done`.

**Terminal B — you, hand-playing the Persona** (a plain shell; the `collab` bin is only on
`PATH` inside a plugin-enabled Claude session, so invoke the CLI directly with the **same**
`COLLAB_DB`):

```bash
export COLLAB_DB=/abs/path/to/collab.db
alias collab='bun /abs/path/to/agent-collaboration/src/cli.ts'

collab poll --as persona                                  # see open questions
collab send --as persona --kind answer --in-reply-to <id> --content "…your decision…"
collab ack <id>                                           # mark it handled
collab dump --jsonl                                       # watch the whole exchange
```

Within ~1 minute Terminal A prints your answer, acts on it, and either asks again or sends
`done`.

### What this verifies

- The Coding Agent routes questions through `collab` instead of blocking at the prompt.
- It consumes answers/`direct` messages, continues in-session, and acks them.
- It terminates with `control done`.
- The `/loop` poll runs unattended (the per-agent `Bash(collab:*)` allowlist).

The deterministic machinery behind the loop (oldest-first delivery, ack-after-send, reply
threading, `control:done` termination) is covered automatically by `test/session.test.ts`.
