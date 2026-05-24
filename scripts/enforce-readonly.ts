// PreToolUse hook — Persona only.
//
// Keeps the Persona Agent read-only: it answers and sends messages, it does not modify
// files. Denies the file-editing tools. The same plugin is enabled in both agents, so this
// script self-scopes by COLLAB_ROLE — it is a no-op (normal permission flow) for the Coding
// Agent. It never blocks Bash, so the Persona can still run `collab`.
//
// Reads the PreToolUse payload JSON from stdin; reads COLLAB_ROLE from env.
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// Only the Persona is read-only; let every other role through untouched.
if (process.env.COLLAB_ROLE !== "persona") {
  process.exit(0);
}

const raw = await Bun.stdin.text();
let toolName = "";
try {
  toolName = (JSON.parse(raw)?.tool_name ?? "").toString();
} catch {
  // Malformed payload — don't interfere.
  process.exit(0);
}

if (EDIT_TOOLS.has(toolName)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "The Persona Agent is read-only: it answers and sends messages, it does not modify files.",
      },
    }) + "\n",
  );
}
process.exit(0);
