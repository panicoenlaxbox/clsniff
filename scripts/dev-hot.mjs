// Dev launcher with hot reload for the viewer.
//
//   npm run dev:hot              → viewer only, Vite HMR
//   npm run dev:hot -- <command> → same, plus sniff <command>'s traffic live
//
// The CLI runs in the foreground with the real TTY so interactive commands
// work; a multiplexer like `concurrently` would pipe stdin and break the REPL.
// Vite starts only once the viewer is listening — otherwise the first SSE
// handshake hits a proxy 500 and, being fatal, never reconnects.
import { spawn } from "node:child_process";
import net from "node:net";

// Vite proxies /api here, so the CLI's viewer must listen on this port.
const PORT = 3747;

// Everything after `--` is the command to sniff (optional).
const command = process.argv.slice(2);
const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);

// Single string (not an args array) avoids the shell:true DEP0190 warning.
const cliCmd = [
  "tsx",
  "src/cli.ts",
  "--viewer",
  "--no-open",
  ...(command.length ? ["--", ...command.map(quote)] : []),
].join(" ");

const cli = spawn(cliCmd, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CLSNIFF_SERVER_PORT: String(PORT) },
});

let vite = null;
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  vite?.kill();
  if (!cli.killed) cli.kill();
  process.exit(code ?? 0);
};

cli.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

// Poll until the viewer accepts connections, then launch Vite.
function waitForPort(port, attempts = 240) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      if (stopping) return reject(new Error("aborted"));
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (n <= 0) return reject(new Error("viewer did not start in time"));
        setTimeout(() => tryOnce(n - 1), 250);
      });
    };
    tryOnce(attempts);
  });
}

waitForPort(PORT)
  .then(() => {
    if (stopping) return;
    // No stdin (the foreground command owns the TTY); run node directly so it's
    // a single process we can kill cleanly.
    vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--open"], {
      cwd: "viewer",
      stdio: ["ignore", "inherit", "inherit"],
    });
    vite.on("exit", () => stop(0));
  })
  .catch(() => {
    // Viewer never came up — the CLI's output explains why.
  });
