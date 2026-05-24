// UserPromptSubmit hook — Persona only.
//
// When the user types free-text prose into the Persona Agent's prompt, relay it verbatim to
// the Coding Agent as a `direct` message and BLOCK the local turn (so the Persona does not
// "answer" the user's own words). Slash commands bypass UserPromptSubmit entirely, so the
// watch commands are unaffected. The same plugin is enabled in both agents, so this script
// self-scopes: it no-ops for any role other than `persona`.
//
// Reads the hook payload JSON from stdin; reads COLLAB_ROLE / COLLAB_DB / COLLAB_ID from env.
import { MessageStore } from "../src/store.ts";

// Only the Persona relays direct input. For any other role, let the prompt through untouched.
if (process.env.COLLAB_ROLE !== "persona") {
  process.exit(0);
}

const raw = await Bun.stdin.text();
let prompt = "";
try {
  prompt = (JSON.parse(raw)?.prompt ?? "").toString();
} catch {
  // Malformed payload — don't interfere with the prompt.
  process.exit(0);
}

// Nothing to relay (e.g. an empty submission) → let it through.
if (prompt.trim() === "") {
  process.exit(0);
}

const store = MessageStore.open();
store.send({ as: "persona", kind: "direct", content: prompt });
store.close();

// Block the local turn and confirm to the user.
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: "Relayed to the Coding Agent as a direct message.",
    systemMessage: "→ forwarded to Coding Agent",
  }) + "\n",
);
process.exit(0);
