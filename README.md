# agent-collaboration

Coding Agent and Software Developer (Agent) Collaboration

## Agent skills

This repo uses a set of engineering/productivity skills installed with the
[`skills`](https://github.com/vercel-labs/skills) CLI. The installed skills and
their pinned versions are recorded in [`skills-lock.json`](./skills-lock.json)
(content sourced from [`mattpocock/skills`](https://github.com/mattpocock/skills),
pinned by hash).

The materialized skill files under `.claude/skills/` and `.agents/skills/` are
**gitignored** — they are regenerable from the lockfile, so they are treated as
installed dependencies rather than checked-in source.

### Reinstalling skills

On a fresh clone (or after `skills-lock.json` changes), restore exactly what is
pinned in the lockfile by running, from the repo root:

```bash
npx skills install
```

This recreates `.claude/skills/` and `.agents/skills/` from `skills-lock.json`.
(`npx skills i` is the short alias; the underlying command is
`npx skills experimental_install`.)

To add a new skill — which updates `skills-lock.json` — use `npx skills add`,
e.g. from Matt Pocock's collection:

```bash
npx skills add mattpocock/skills
```

See the [`skills` CLI docs](https://github.com/vercel-labs/skills) for the full
command set.

### Per-repo configuration

The skills read repo-specific settings from:

- [`CLAUDE.md`](./CLAUDE.md) — the `## Agent skills` block
- [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md) — issues live in GitHub Issues (via the `gh` CLI)
- [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md) — triage label vocabulary
- [`docs/agents/domain.md`](./docs/agents/domain.md) — domain-doc layout (single-context: `CONTEXT.md` + `docs/adr/`)
