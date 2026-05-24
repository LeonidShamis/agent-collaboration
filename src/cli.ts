#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { MessageStore, assertRole, assertKind } from "./store.ts";
import { renderTimeline } from "./timeline.ts";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const USAGE = "expected one of: init | send | poll | ack | dump | show";

// `show --follow`: print the timeline, then stream new messages until interrupted.
async function followTimeline(
  store: MessageStore,
  opts: { all: boolean; color: boolean },
): Promise<void> {
  const initial = store.dump({ all: opts.all });
  process.stdout.write(renderTimeline(initial, { color: opts.color }) + "\n");
  let lastId = initial.length ? initial[initial.length - 1]!.id : 0;
  for (;;) {
    await Bun.sleep(1500);
    const all = store.dump({ all: opts.all });
    const fresh = all.filter((m) => m.id > lastId);
    if (fresh.length > 0) {
      process.stdout.write("\n" + renderTimeline(fresh, { color: opts.color }) + "\n");
      lastId = all[all.length - 1]!.id;
    }
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      as: { type: "string" },
      kind: { type: "string" },
      content: { type: "string" },
      "in-reply-to": { type: "string" },
      jsonl: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      follow: { type: "boolean", default: false },
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
        const history = store.dump({ all: values.all });
        if (values.jsonl) {
          for (const m of history) console.log(JSON.stringify(m));
        } else {
          console.log(JSON.stringify(history));
        }
        break;
      }

      case "show": {
        // Color when writing to a terminal; plain when piped/redirected.
        const color = Boolean(process.stdout.isTTY);
        if (values.follow) {
          await followTimeline(store, { all: Boolean(values.all), color });
        } else {
          console.log(renderTimeline(store.dump({ all: values.all }), { color }));
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

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
