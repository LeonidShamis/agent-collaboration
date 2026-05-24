---
description: Stop this agent's collaboration watch loop
---

Stop watching the collaboration **in this session**:

- **End the recurring watch loop** you started (the `/loop` running `/collab:coding-watch` or
  `/collab:persona-watch`) — cancel it so no further ticks fire.
- Do **not** send any `collab` message; this is a local stop.
- Confirm to the user that watching has stopped.

This stops only **this** agent. Stop the other agent in its own session (run `/collab:stop`
there, or let it stop on `control done`). Prefer this command over typing "stop" as prose —
on the Persona, prose is relayed to the Coding Agent, not treated as a stop.
