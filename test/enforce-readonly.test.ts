import { test, expect } from "bun:test";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../scripts/enforce-readonly.ts");

function runHook(payload: object, env: Record<string, string>) {
  const proc = Bun.spawnSync(["bun", "run", SCRIPT], {
    stdin: Buffer.from(JSON.stringify(payload)),
    env: { ...process.env, ...env },
  });
  return { stdout: proc.stdout.toString().trim(), exitCode: proc.exitCode };
}

test("Persona: an Edit/Write tool call is denied (read-only)", () => {
  const res = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "x.ts" } },
    { COLLAB_ROLE: "persona" },
  );

  expect(res.exitCode).toBe(0);
  expect(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("Coding Agent: an Edit/Write tool call is allowed (hook is a no-op)", () => {
  const res = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "x.ts" } },
    { COLLAB_ROLE: "coding" },
  );

  expect(res.exitCode).toBe(0);
  expect(res.stdout).toBe(""); // no decision emitted → normal permission flow
});
