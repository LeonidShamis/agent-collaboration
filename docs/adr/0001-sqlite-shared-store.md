# SQLite as the single shared store

The two collaborating Claude Code processes communicate through a single **SQLite**
database in the collaboration directory, which serves **both** live message transport
*and* full history. We chose it over file-per-message inboxes and append-only JSONL logs
because SQLite gives ACID writes and concurrency handling for free — two processes can
poll and write with no race conditions, no temp-file-rename dance, and no per-reader
cursor bookkeeping — while still being a local, embedded, CLI-driven store with no external
service. Collapsing transport and history into one store also satisfies the debug-log
requirement (point 6) without a second mechanism.

## Considered options

- **File-per-message inboxes** (drop a file, move to `processed/`): dead simple and
  human-readable, but no unified history and fiddly ordering.
- **Append-only JSONL**: matches the original logging instinct, but each reader must track
  a consume cursor and concurrent appends/partial reads need care.
- **SQLite (chosen)**: one `.db` file; a small bun/TypeScript CLI exposes
  enqueue / poll-inbox / mark-processed / dump-history. Human-readability is preserved via
  a `dump` to JSONL on demand.
