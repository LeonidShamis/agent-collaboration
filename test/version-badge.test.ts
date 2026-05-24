import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The version badge is static (a dynamic shields badge can't read a private repo's
// plugin.json), so guard it: bumping the plugin version without updating the README badge
// fails CI. plugin.json is the single source of truth.
test("README version badge matches .claude-plugin/plugin.json version", () => {
  const root = join(import.meta.dir, "..");
  const version = JSON.parse(
    readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"),
  ).version as string;
  const readme = readFileSync(join(root, "README.md"), "utf8");

  expect(readme).toContain(`badge/plugin-v${version}-`); // shields static badge encodes the version here
});
