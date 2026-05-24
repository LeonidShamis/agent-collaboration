import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Role = "coding" | "persona";
export type Kind = "question" | "answer" | "direct" | "control";

export interface Message {
  id: number;
  collaborationId: string;
  createdAt: string;
  sender: Role;
  recipient: Role;
  kind: Kind;
  content: string;
  inReplyTo: number | null;
  processedAt: string | null;
}

export interface OpenOptions {
  dbPath?: string;
  collaborationId?: string;
}

export interface SendArgs {
  as: Role;
  kind: Kind;
  content: string;
  inReplyTo?: number;
}

export const ROLES: readonly Role[] = ["coding", "persona"];
export const KINDS: readonly Kind[] = ["question", "answer", "direct", "control"];

const DEFAULT_DB_PATH = ".collab/collab.db";
const DEFAULT_COLLABORATION_ID = "default";

export function assertRole(value: unknown): asserts value is Role {
  if (!ROLES.includes(value as Role)) {
    throw new Error(`invalid role "${value}" (expected one of: ${ROLES.join(", ")})`);
  }
}

export function assertKind(value: unknown): asserts value is Kind {
  if (!KINDS.includes(value as Kind)) {
    throw new Error(`invalid kind "${value}" (expected one of: ${KINDS.join(", ")})`);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  collaboration_id TEXT    NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  sender           TEXT    NOT NULL CHECK (sender    IN ('coding','persona')),
  recipient        TEXT    NOT NULL CHECK (recipient IN ('coding','persona')),
  kind             TEXT    NOT NULL CHECK (kind IN ('question','answer','direct','control')),
  content          TEXT    NOT NULL,
  in_reply_to      INTEGER REFERENCES messages(id),
  processed_at     TEXT
);
`;

function otherRole(role: Role): Role {
  return role === "coding" ? "persona" : "coding";
}

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as number,
    collaborationId: row.collaboration_id as string,
    createdAt: row.created_at as string,
    sender: row.sender as Role,
    recipient: row.recipient as Role,
    kind: row.kind as Kind,
    content: row.content as string,
    inReplyTo: (row.in_reply_to as number | null) ?? null,
    processedAt: (row.processed_at as string | null) ?? null,
  };
}

export class MessageStore {
  private constructor(
    private readonly db: Database,
    private readonly collaborationId: string,
  ) {}

  static open(opts: OpenOptions = {}): MessageStore {
    const dbPath = opts.dbPath ?? process.env.COLLAB_DB ?? DEFAULT_DB_PATH;
    const collaborationId =
      opts.collaborationId ?? process.env.COLLAB_ID ?? DEFAULT_COLLABORATION_ID;

    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA);

    return new MessageStore(db, collaborationId);
  }

  send(args: SendArgs): Message {
    assertRole(args.as);
    assertKind(args.kind);

    const row = this.db
      .query(
        `INSERT INTO messages (collaboration_id, sender, recipient, kind, content, in_reply_to)
         VALUES ($collaborationId, $sender, $recipient, $kind, $content, $inReplyTo)
         RETURNING *`,
      )
      .get({
        $collaborationId: this.collaborationId,
        $sender: args.as,
        $recipient: otherRole(args.as),
        $kind: args.kind,
        $content: args.content,
        $inReplyTo: args.inReplyTo ?? null,
      }) as Record<string, unknown>;

    return toMessage(row);
  }

  poll(args: { as: Role }): Message[] {
    const rows = this.db
      .query(
        `SELECT * FROM messages
         WHERE recipient = $recipient
           AND collaboration_id = $collaborationId
           AND processed_at IS NULL
         ORDER BY id`,
      )
      .all({
        $recipient: args.as,
        $collaborationId: this.collaborationId,
      }) as Record<string, unknown>[];

    return rows.map(toMessage);
  }

  ack(id: number): void {
    this.db
      .query(
        `UPDATE messages SET processed_at = datetime('now')
         WHERE id = $id AND processed_at IS NULL`,
      )
      .run({ $id: id });
  }

  dump(opts: { all?: boolean } = {}): Message[] {
    const rows = (
      opts.all
        ? this.db.query(`SELECT * FROM messages ORDER BY id`).all()
        : this.db
            .query(
              `SELECT * FROM messages
               WHERE collaboration_id = $collaborationId
               ORDER BY id`,
            )
            .all({ $collaborationId: this.collaborationId })
    ) as Record<string, unknown>[];

    return rows.map(toMessage);
  }

  close(): void {
    this.db.close();
  }
}
