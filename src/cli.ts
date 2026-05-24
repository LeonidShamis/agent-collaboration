#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { MessageStore, assertRole, assertKind } from "./store.ts";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const USAGE = "expected one of: init | send | poll | ack | dump";

function main(): void {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      as: { type: "string" },
      kind: { type: "string" },
      content: { type: "string" },
      "in-reply-to": { type: "string" },
      jsonl: { type: "boolean", default: false },
    },
  });

  const command = positionals[0];
  if (!command) fail(`missing command (${USAGE})`);

  const store = MessageStore.open();
  try {
    switch (command) {
      case "init": {
        // MessageStore.open() has already created the schema idempotently.
        console.log("initialized");
        break;
      }

      case "send": {
        const { as, kind, content } = values;
        if (as === undefined) fail("send requires --as <coding|persona>");
        if (kind === undefined) fail("send requires --kind <question|answer|direct|control>");
        if (content === undefined) fail("send requires --content <text>");
        assertRole(as);
        assertKind(kind);

        const inReplyToRaw = values["in-reply-to"];
        let inReplyTo: number | undefined;
        if (inReplyToRaw !== undefined) {
          inReplyTo = Number(inReplyToRaw);
          if (!Number.isInteger(inReplyTo)) fail("--in-reply-to must be an integer message id");
        }

        const msg = store.send({ as, kind, content, inReplyTo });
        console.log(msg.id);
        break;
      }

      case "poll": {
        const { as } = values;
        if (as === undefined) fail("poll requires --as <coding|persona>");
        assertRole(as);
        console.log(JSON.stringify(store.poll({ as })));
        break;
      }

      case "ack": {
        const idRaw = positionals[1];
        const id = Number(idRaw);
        if (idRaw === undefined || !Number.isInteger(id)) {
          fail("ack requires an integer message id");
        }
        store.ack(id);
        break;
      }

      case "dump": {
        const history = store.dump();
        if (values.jsonl) {
          for (const m of history) console.log(JSON.stringify(m));
        } else {
          console.log(JSON.stringify(history));
        }
        break;
      }

      default:
        fail(`unknown command "${command}" (${USAGE})`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    store.close();
  }
}

main();
