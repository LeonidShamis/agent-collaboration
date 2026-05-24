# Running a collaboration

How to launch and drive the Coding Agent ↔ Persona Agent collaboration. As slices land,
more of this becomes automatic. Today (`#1` + `#2`) the **Coding Agent** is real and the
**Persona** is hand-simulated from a shell.

## One-time setup

```bash
bun install
```

The Message Store is created automatically on first use at `.collab/collab.db`
(`COLLAB_DB` overrides the path; `COLLAB_ID` overrides the collaboration id, default
`"default"`). Both sides must point at the **same** store — easiest is to run everything
from the project root so they share `.collab/collab.db`.

## Manual smoke (`#2`: Coding Agent loop, Persona hand-simulated)

**Terminal A — the Coding Agent** (a normal Claude Code session in the project root):

1. Arm the watch loop **first** so the collaboration protocol is in context before you give
   the task:
   ```
   /loop 1m /coding-watch
   ```
2. Then type the task, e.g. *"Add a rate limiter to the API."*
3. When the agent gets stuck it will, instead of asking you at the prompt, run
   `collab send --as coding --kind question …` and stop. Each tick it polls its inbox and
   continues when an answer arrives. When finished it sends `control done`.

**Terminal B — you, hand-playing the Persona** (also in the project root):

```bash
# see the Coding Agent's open questions
bun run --silent collab poll --as persona

# answer one (use the question's id), then mark it handled
bun run --silent collab send --as persona --kind answer --in-reply-to <id> --content "…your decision…"
bun run --silent collab ack <id>

# watch the whole exchange at any time
bun run --silent collab dump --jsonl
```

Within ~1 minute Terminal A should print your answer, act on it, and either ask the next
question or send `done`.

### What this verifies

- The Coding Agent routes questions through `collab` instead of blocking at the prompt.
- It consumes answers/`direct` messages from its inbox, continues in-session, and acks them.
- It terminates the collaboration with `control done`.
- The `/loop` poll runs unattended (no per-tick permission prompt — see
  `.claude/settings.json`).

The deterministic machinery behind this loop (oldest-first delivery, ack-after-send, reply
threading, `control:done` termination) is covered automatically by `test/session.test.ts`.
