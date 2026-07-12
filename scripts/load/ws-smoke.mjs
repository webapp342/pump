/**
 * WebSocket connection smoke test — run on VM after phase 4.
 *
 *   node scripts/load/ws-smoke.mjs --connections 1000 --url ws://127.0.0.1:3013
 *   # Public path (browser): wss://your-domain/ws via nginx — do not use ws://127.0.0.1/ws (port 80 → HTTPS redirect)
 */
import { WebSocket } from "ws";

function parseArgs(argv) {
  let connections = 100;
  let url = "ws://127.0.0.1:3013";
  let room = "arena";

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--connections") {
      connections = Number(argv[++i] ?? connections);
    } else if (arg === "--url") {
      url = String(argv[++i] ?? url);
    } else if (arg === "--room") {
      room = String(argv[++i] ?? room);
    }
  }

  return { connections, url, room };
}

async function main() {
  const { connections, url, room } = parseArgs(process.argv);
  const started = Date.now();
  let open = 0;
  let failed = 0;

  await Promise.all(
    Array.from({ length: connections }, (_, index) =>
      new Promise((resolve) => {
        const ws = new WebSocket(url);

        const finish = (ok) => {
          if (ok) open += 1;
          else failed += 1;
          resolve();
        };

        const timer = setTimeout(() => {
          ws.terminate();
          finish(false);
        }, 10_000);

        ws.on("open", () => {
          clearTimeout(timer);
          ws.send(JSON.stringify({ type: "subscribe", room }));
          ws.close();
          finish(true);
        });

        ws.on("error", () => {
          clearTimeout(timer);
          finish(false);
        });

        if (index % 100 === 0) {
          process.stdout.write(`progress ${index}/${connections}\n`);
        }
      })
    )
  );

  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        connections,
        open,
        failed,
        elapsedMs,
        targetMet: open >= connections * 0.95,
      },
      null,
      2
    )
  );

  if (failed > connections * 0.05) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
