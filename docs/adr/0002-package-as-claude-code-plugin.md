# Package the collaboration capability as a Claude Code plugin

The collab capability (the `collab` message-bus CLI, the watch commands, and later the
hooks) is packaged as a **Claude Code plugin** rather than as project-local
`.claude/commands` + scripts. The repo root *is* the plugin (`.claude-plugin/plugin.json`,
`bin/`, `commands/`, `hooks/`, with the CLI in `src/`). Each agent enables it independently
with `claude --plugin-dir <repo>`, so the same capability drops into any directory — which
also solves how the **blind Persona** (running in its own directory, with no project code)
reaches the CLI: a `bin/collab` wrapper is added to the Bash `PATH` while the plugin is
enabled, and commands/hooks can reference bundled files via `${CLAUDE_PLUGIN_ROOT}`. This
makes the whole system reusable across future collaborative projects.

## Considered options

- **Project-local `.claude/commands` + a repo-checked-in CLI (the #1/#2 starting point):**
  simplest, but tied to one repo and requires the agent to run inside that repo (the blind
  Persona in its own dir can't reach `bun run collab`).
- **Global CLI via `bun link`:** makes `collab` available anywhere, but is an imperative,
  machine-global setup step and doesn't package the commands/hooks for reuse.
- **Claude Code plugin (chosen):** commands, the bundled CLI (`bin/collab` on `PATH`), hooks,
  and config travel together; installs per-directory via `--plugin-dir`; namespaced commands
  (`/collab:coding-watch`); reusable across projects.

## Consequences

- Plugins **cannot** contribute permission allowlists, so each agent's directory still needs
  `permissions.allow: ["Bash(collab:*)"]` in its own `.claude/settings.json` (a documented
  per-agent setup step). Hook-invoked CLI calls run unsandboxed and need no allowlist.
- The bundled CLI must stay **dependency-free** (plugin deps are not auto-installed); we
  rely on bun's built-in `bun:sqlite`, so this holds.
- Hooks ship in `hooks/hooks.json`; the same plugin is enabled in both agents, so role-
  specific hooks (e.g. the Persona-only relay) are scoped by checking `$COLLAB_ROLE` inside
  the hook script.
