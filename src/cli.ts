#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { startProxy } from "./proxy.js";

const program = new Command();

program
  .name("clsniff")
  .description(
    "Wrap any console command and intercept its HTTP/HTTPS traffic, saving each request/response pair as a JSON file."
  )
  .version("1.0.0")
  .argument("<command>", "Command to run (after --)")
  .argument("[args...]", "Arguments forwarded to the command")
  .option(
    "--merge-sse",
    "Merge SSE event data into a single body string instead of keeping individual events",
    false
  )
  .option(
    "--output-dir <path>",
    "Directory where session log folders are created",
    path.join(os.homedir(), ".clsniff", "logs")
  )
  .option(
    "--port <number>",
    "Port for the local proxy (default: 0 = OS auto-assign)",
    (value: string) => {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 0 || n > 65535) {
        throw new InvalidArgumentError("Port must be 0-65535.");
      }
      return n;
    },
    0
  )
  .option(
    "--mask-headers <names>",
    "Comma-separated header names to redact in JSON output (e.g. Authorization,x-api-key). Can be repeated.",
    (value: string, prev: string[]) =>
      prev.concat(value.split(",").map((s) => s.trim())),
    [] as string[]
  )
  .option(
    "--filter <pattern>",
    "Only log requests whose URL matches this regex. Can be repeated (OR logic).",
    (value: string, prev: RegExp[]) => {
      try {
        return prev.concat(new RegExp(value));
      } catch {
        throw new InvalidArgumentError(`Invalid regex: ${value}`);
      }
    },
    [] as RegExp[]
  )
  .option(
    "--name <name>",
    "Name for the session folder instead of the auto-generated timestamp."
  )
  .option(
    "--exclude <pattern>",
    "Never log requests whose URL matches this regex. Can be repeated. Takes precedence over --filter.",
    (value: string, prev: RegExp[]) => {
      try {
        return prev.concat(new RegExp(value));
      } catch {
        throw new InvalidArgumentError(`Invalid regex: ${value}`);
      }
    },
    [] as RegExp[]
  )
  // Allow the -- separator so users can write: clsniff [options] -- command args
  .passThroughOptions(true)
  .allowUnknownOption(false);

async function main(): Promise<void> {
  program.parse(process.argv);

  const opts = program.opts<{
    mergeSse: boolean;
    outputDir: string;
    port: number;
    name?: string;
    maskHeaders: string[];
    filter: RegExp[];
    exclude: RegExp[];
  }>();

  // Silence all console output from third-party libraries.
  // The child process uses stdio: 'inherit', so any console output from the
  // parent would be interleaved with the child's output.
  for (const key of Object.keys(console)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (console as any)[key] === "function") (console as any)[key] = () => {};
  }

  const positional = program.args;
  if (!positional.length) {
    process.stderr.write("[clsniff] error: no command provided.\n");
    program.help();
    process.exit(1);
  }

  const [command, ...commandArgs] = positional;

  // Create session directory: <outputDir>/<name|timestamp>/
  const sessionName = opts.name ?? new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(opts.outputDir, sessionName);

  if (opts.name && fs.existsSync(sessionDir)) {
    const entries = fs.readdirSync(sessionDir);
    if (entries.length) {
      process.stderr.write(
        `[clsniff] session "${opts.name}" already exists and is not empty. Choose a different name or remove the folder.\n`
      );
      process.exit(1);
    }
  }

  fs.mkdirSync(sessionDir, { recursive: true });

  // clsniff.log: all internal clsniff messages are always written here.
  const clsniffLogPath = path.join(sessionDir, "clsniff.log");
  const logStream = fs.createWriteStream(clsniffLogPath, { flags: "a" });

  const log = (msg: string) => {
    logStream.write(`${new Date().toISOString()} ${msg}\n`);
  };

  // Start MITM proxy
  let proxyHandle: Awaited<ReturnType<typeof startProxy>>;
  try {
    proxyHandle = await startProxy({
      port: opts.port,
      sessionDir,
      mergeSse: opts.mergeSse,
      maskHeaders: opts.maskHeaders,
      filters: opts.filter,
      excludes: opts.exclude,
      onError: (url, kind, message) =>
        log(`proxy error [${kind}] on ${url}: ${message}`),
      onEntry: (method, url, status) => {
        try {
          const { origin, pathname } = new URL(url);
          log(`entry: ${method} ${origin}${pathname} → ${status}`);
        } catch {
          log(`entry: ${method} ${url} → ${status}`);
        }
      },
    });
  } catch (err) {
    log(`failed to start proxy: ${err}`);
    process.stderr.write(`[clsniff] failed to start proxy: ${err}\n`);
    logStream.end(() => process.exit(1));
    return;
  }

  if (proxyHandle.caIsNew) {
    log(`CA certificate generated at: ${proxyHandle.caPath}`);
  }
  log(`proxy listening on port ${proxyHandle.port}`);
  log(`session dir: ${sessionDir}`);
  log(`command: ${[command, ...commandArgs].join(" ")}`);

  // Environment variables injected into the child process
  const proxyUrl = `http://127.0.0.1:${proxyHandle.port}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Standard proxy vars (uppercase and lowercase variants for maximum compatibility)
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    // CA trust vars for common runtimes
    NODE_EXTRA_CA_CERTS: proxyHandle.caPath, // Node.js
    SSL_CERT_FILE: proxyHandle.caPath, // OpenSSL-based runtimes
    REQUESTS_CA_BUNDLE: proxyHandle.caPath, // Python requests library
    // NODE_USE_ENV_PROXY is intentionally NOT set here. Enabling it activates undici's
    // HTTP/2 proxy mode which conflicts with our HTTP/1.1-only MITM proxy.
    // Most SDK-based clients (Anthropic, OpenAI, etc.) handle HTTPS_PROXY natively
    // without needing this variable.
  };

  // On Windows, .cmd/.bat files (e.g. npm, npx) require shell:true to be found
  const useShell = process.platform === "win32";

  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env: childEnv,
    shell: useShell,
  });

  // Forward signals to the child process
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("error", (err) => {
    log(`failed to start command: ${err.message}`);
    process.stderr.write(`[clsniff] failed to start command: ${err.message}\n`);
    proxyHandle.close();
    logStream.end();
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    proxyHandle.close();
    log(`child exited with code ${code ?? signal}`);
    logStream.end(() => {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 1);
      }
    });
  });
}

main().catch((err) => {
  process.stderr.write(`[clsniff] unexpected error: ${err}\n`);
  process.exit(1);
});
