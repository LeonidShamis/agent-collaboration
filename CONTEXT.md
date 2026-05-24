# Agent Collaboration

A system where two interactive Claude Code processes collaborate on a coding task: one
does the engineering work, the other answers on the user's behalf using a persona
document. The full spec lives in [`docs/design/collaboration.md`](./docs/design/collaboration.md).

## Language

**Coding Agent**:
The Claude Code process that performs the actual engineering work. Sends a message to the
Persona Agent only when it is blocked and would otherwise stop to ask the human.
_Avoid_: worker, bot, the "real" agent.

**Persona Agent**:
The Claude Code process that answers on the user's behalf, booted with `SOUL.md` appended
to its system prompt. Answers every message from the Coding Agent and relays messages the
human types directly into its prompt.
_Avoid_: clone, soul (the agent), the "ME" agent, bot.

**SOUL.md**:
The document capturing the user's experience, skills, preferences, and goals. Appended to
the Persona Agent's system prompt so it can answer as the user.
_Avoid_: profile, persona file.

**Collaboration**:
A single end-to-end interaction between one Coding Agent and one Persona Agent, scoped to
its own project directory. One day there may be several concurrent.
_Avoid_: session (reserved for Claude Code's own session concept — see Flagged ambiguities),
run, conversation.

**Message**:
A unit of communication from one agent to the other, persisted in the Message Store.
_Avoid_: note, event.

**Inbox**:
The unprocessed messages addressed to a given agent — a query over the Message Store, not a
separate place.
_Avoid_: queue, mailbox, message board.

**Message Store**:
The single SQLite database in the collaboration directory holding all messages, serving
both live transport and full history.
_Avoid_: message board, mailbox, broker, queue, database (unqualified).

## Flagged ambiguities

- **"Agent"** is overloaded. Here it means one of the two top-level Claude Code processes
  (Coding Agent / Persona Agent). Claude Code's *sub-agents* (the Task tool) are a different
  thing — always qualify if referring to those.
- **"Session"** is overloaded. Claude Code has its own internal "session" (the resumable
  conversation). For our top-level interaction, use **Collaboration** instead.

## Example dialogue

> **Coding Agent:** I'm blocked — should the rate limiter key on user ID or API key? I'll
> send the question.
> *(writes a `question` Message to the Persona Agent's Inbox)*
>
> **Persona Agent:** Got a question in my Inbox. Given the user's stated preference for
> simplicity and their solo-ship constraint, key on API key and note the tradeoff. I'll
> answer.
> *(writes an `answer` Message back to the Coding Agent's Inbox)*
>
> **User** *(typing directly into the Persona Agent):* Also tell it to add a metrics counter.
> *(the Persona Agent relays this as a `direct` Message to the Coding Agent)*
