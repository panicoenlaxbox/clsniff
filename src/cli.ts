#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { startProxy } from "./proxy.js";
import { startViewer } from "./server.js";

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
) as { version: string };

const program = new Command();

program
  .name("clsniff")
  .description(
    "Wrap any console command and intercept its HTTP/HTTPS traffic, saving each request/response pair as a JSON file."
  )
  .version(version)
  .argument("[command]", "Command to run (after --)")
  .argument("[args...]", "Arguments forwarded to the command")
  .option(
    "--output-dir <path>",
    "Directory where session log folders are created",
    path.join(os.homedir(), ".clsniff")
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
    "--name <name>",
    "Name for the session folder instead of the auto-generated timestamp."
  )
  .option(
    "--exclude <hosts>",
    "Comma-separated hosts to bypass interception entirely (NO_PROXY format, e.g. localhost,.example.com). Can be repeated.",
    (value: string, prev: string[]) =>
      prev.concat(value.split(",").map((s) => s.trim()).filter(Boolean)),
    [] as string[]
  )
  .option(
    "--install-cert",
    "Install mitmproxy CA certificate in the system trust store",
    false
  )
  .option(
    "--viewer",
    "Start a web-based log viewer for captured sessions",
    false
  )
  .option(
    "--no-open",
    "Do not auto-open the browser when starting the viewer"
  )
  // Allow the -- separator so users can write: clsniff [options] -- command args
  .passThroughOptions(true)
  .allowUnknownOption(false);

// Wraps args containing spaces in double quotes so cmd.exe treats them as a single token.
function quoteWindowsArg(arg: string): string {
  return arg.includes(" ") ? `"${arg}"` : arg;
}

function installCert(cerPath: string): void {
  if (!fs.existsSync(cerPath)) {
    process.stderr.write(
      `[clsniff] Warning: CA cert not found at ${cerPath}. Cannot install.\n`
    );
    return;
  }
  if (process.platform === "win32") {
    process.stderr.write(
      `[clsniff] Installing CA certificate in Windows trusted root store...\n`
    );
    const result = spawnSync("certutil", ["-addstore", "-user", "Root", cerPath], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.stderr.write(
        `[clsniff] Warning: certutil failed. You can install it manually:\n` +
        `  certutil -addstore -user Root "${cerPath}"\n`
      );
    }
  } else if (process.platform === "darwin") {
    process.stderr.write(
      `[clsniff] To trust the CA certificate on macOS, run:\n` +
      `  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${cerPath.replace(/\.pem$/, ".cer")}"\n`
    );
  } else {
    process.stderr.write(
      `[clsniff] To trust the CA certificate on Linux, follow your distro's instructions for adding a CA cert.\n` +
      `  Cert location: ${cerPath}\n`
    );
  }
}

async function main(): Promise<void> {
  program.parse(process.argv);

  const opts = program.opts<{
    outputDir: string;
    port: number;
    name?: string;
    maskHeaders: string[];
    exclude: string[];
    installCert: boolean;
    viewer: boolean;
    open: boolean;
  }>();

  // Silence all console output from third-party libraries so it doesn't
  // interleave with the child process output (which uses stdio: 'inherit').
  for (const key of Object.keys(console)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (console as any)[key] === "function") (console as any)[key] = () => {};
  }

  const positional = program.args;

  if (opts.installCert && !positional.length) {
    const caCerPath = path.join(os.homedir(), ".mitmproxy", "mitmproxy-ca-cert.cer");
    installCert(caCerPath);
    process.exit(0);
  }

  // --viewer without a command: standalone viewer mode (browse existing sessions)
  if (opts.viewer && !positional.length) {
    const viewerHandle = await startViewer({
      outputDir: opts.outputDir,
      open: opts.open,
    });
    process.stderr.write(`[clsniff] viewer running at ${viewerHandle.url}\n`);
    const shutdown = () => {
      viewerHandle.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return; // keep process alive
  }

  if (!positional.length) {
    process.stderr.write("[clsniff] error: no command provided.\n");
    program.help();
    process.exit(1);
  }

  const [command, ...commandArgs] = positional;

  // Create session directory: <outputDir>/<name|timestamp>/
  const sessionName = opts.name ?? new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.resolve(opts.outputDir, sessionName);

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

  // Start mitmdump proxy
  let proxyHandle: Awaited<ReturnType<typeof startProxy>>;
  try {
    proxyHandle = await startProxy({
      port: opts.port,
      sessionDir,
      maskHeaders: opts.maskHeaders,
      excludes: opts.exclude,
      logFile: clsniffLogPath,
      onError: (message) => log(`proxy error: ${message}`),
    });
  } catch (err) {
    log(`failed to start proxy: ${err}`);
    process.stderr.write(`[clsniff] failed to start proxy: ${err}\n`);
    logStream.end(() => process.exit(1));
    return;
  }

  // Install CA certificate on first run or when explicitly requested alongside a command
  if (proxyHandle.caIsNew || opts.installCert) {
    const caCerPath = path.join(os.homedir(), ".mitmproxy", "mitmproxy-ca-cert.cer");
    installCert(caCerPath);
  }

  log(`proxy listening on port ${proxyHandle.port}`);
  log(`session dir: ${sessionDir}`);
  log(`options: ${JSON.stringify(opts)}`);


  // Start viewer alongside the proxy if requested
  let viewerHandle: Awaited<ReturnType<typeof startViewer>> | null = null;
  if (opts.viewer) {
    try {
      viewerHandle = await startViewer({
        outputDir: opts.outputDir,
        activeSession: sessionName,
        open: opts.open,
      });
      process.stderr.write(`[clsniff] viewer running at ${viewerHandle.url}\n`);
      log(`viewer running at ${viewerHandle.url}`);
    } catch (err) {
      process.stderr.write(`[clsniff] warning: could not start viewer: ${err}\n`);
    }
  }

  // Environment variables injected into the child process
  const proxyUrl = `http://127.0.0.1:${proxyHandle.port}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Standard proxy vars (uppercase and lowercase for maximum compatibility)
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    // Bypass localhost to avoid the proxy routing traffic to itself
    NO_PROXY: "localhost,127.0.0.1",
    no_proxy: "localhost,127.0.0.1",
    // CA trust vars for common runtimes
    NODE_EXTRA_CA_CERTS: proxyHandle.caPath, // Node.js
    REQUESTS_CA_BUNDLE: proxyHandle.caPath,  // Python requests library
    SSL_CERT_FILE: proxyHandle.caPath,       // OpenSSL-based tools (curl, Go, Ruby…)
    // NODE_USE_ENV_PROXY is intentionally NOT set here. Enabling it activates undici's
    // HTTP/2 proxy mode which conflicts with our HTTP/1.1-only MITM proxy.
  };

  // On Windows, .cmd/.bat files (e.g. npm, npx) require shell:true to be found.
  // When shell:true, Node.js joins args with spaces without quoting, so args that
  // contain spaces must be pre-quoted or cmd.exe will split them into extra tokens.
  const useShell = process.platform === "win32";

  const spawnArgs = useShell ? commandArgs.map(quoteWindowsArg) : commandArgs;
  log(`command: ${command} ${JSON.stringify(spawnArgs)}`);

  const child = spawn(command, spawnArgs, {
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
    viewerHandle?.close();
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
