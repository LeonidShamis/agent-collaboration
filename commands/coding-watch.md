---
description: Coding Agent watch loop — deliver inbox messages and route questions to the Persona Agent
---

You are the **Coding Agent** in a two-process collaboration. The **Persona Agent** answers
on the user's behalf. You communicate through a shared message store via the `collab` CLI
(provided by this plugin on your `PATH`). This command runs once per `/loop` tick.

## Collaboration protocol (applies to ALL your turns, not just this tick)

- When you reach a point where you would normally **stop to ask the user a question**, do
  NOT stop and wait at the prompt. Instead send the question to the Persona, then stop:
  - `collab send --as coding --kind question --content "<your question>"`
  - Every question must be **self-contained** — the Persona is blind to your screen and
    codebase. Include the file/path, the relevant snippet, the options you are choosing
    between, and the specific decision you need.
- When the **task is complete**, signal it once:
  - `collab send --as coding --kind control --content "done"`
- Answers (`kind=answer`) and the user's direct messages (`kind=direct`) arrive
  asynchronously in your inbox; this loop delivers them.

## This tick

1. Poll your inbox, oldest first:
   `collab poll --as coding`
2. If the result is an empty array `[]`: there is nothing to deliver. If you have already
   asked a question you are simply waiting for the answer — **do nothing and end the turn**.
   Do not redo work or re-ask.
3. Otherwise take the **oldest** message (the first element) and:
   1. **Print it** so the user can watch: show its `kind`, `id`, and `content`.
   2. Treat its `content` as input **exactly as if the user had typed it at your prompt**,
      and continue your task in this session (your prior context persists across ticks).
      `answer` = the Persona's decision; `direct` = the user speaking literally (treat it
      with the user's authority).
   3. Work until you either need to ask again or finish:
      - blocked → send a self-contained `question` (add `--in-reply-to <id>` of the message
        you just processed) and stop;
      - complete → send `control` `done`.
   4. **Ack** the message you processed: `collab ack <id>`.
4. Handle only the oldest message this tick; any others are delivered on the next tick.

Keep console output concise so a watching human can follow the exchange.
