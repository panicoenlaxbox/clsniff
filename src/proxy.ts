import { spawn } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as os from "os";

export interface ProxyOptions {
  /** Port to listen on. Use 0 for OS auto-assign (default). */
  port?: number;
  /** Directory for session JSON log files. */
  sessionDir: string;
  /** Header names to redact in the JSON output (case-insensitive). */
  maskHeaders: string[];
  /** NO_PROXY-style entries to bypass, optionally port-scoped (e.g. ".example.com", "localhost:5000"). */
  exclude: string[];
  /** URL substrings whose matching requests are intercepted but excluded from the JSON log. */
  excludeUrl: string[];
  /** Path to the clsniff.log file. */
  logFile: string;
  /** Explicit path to the mitmdump executable. When omitted it is auto-discovered. */
  mitmdumpPath?: string;
  /** Called when mitmdump emits an error after startup. */
  onError?: (message: string) => void;
}

export interface ProxyHandle {
  port: number;
  /** Absolute path to the mitmproxy CA certificate (PEM). */
  caPath: string;
  /** Whether the CA certificate was freshly generated this run. */
  caIsNew: boolean;
  close(): void;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits a NO_PROXY-style entry into its host and optional port. Only a colon-free host
 * can carry a port, so bare IPv6 addresses keep their colons.
 *
 * Examples:
 *   "localhost:5000"      → { host: "localhost", port: "5000" }
 *   "::1"                 → { host: "::1" }
 *   "[::1]:5000"          → { host: "::1", port: "5000" }
 */
export function parseHostEntry(entry: string): { host: string; port?: string } {
  const bracketed = /^\[(.+)\](?::(\d{1,5}))?$/.exec(entry);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] };
  }
  const withPort = /^([^:]+):(\d{1,5})$/.exec(entry);
  if (withPort) {
    return { host: withPort[1], port: withPort[2] };
  }
  return { host: entry };
}

/**
 * Converts a NO_PROXY-style entry to a regex pattern for mitmdump's --ignore-hosts.
 *
 * mitmdump matches with re.search against candidates that always carry the port
 * ("host:port", from the peer address, the Host header and the TLS SNI), hence the anchors
 * and the trailing port: an entry without one matches every port.
 *
 * Examples:
 *   "localhost:5000"      → "^localhost:5000$"
 *   "127.0.0.1"           → "^127\\.0\\.0\\.1:\\d+$"
 *   ".example.com"        → "^(.*\\.)?example\\.com:\\d+$"
 */
function hostEntryToRegex(entry: string): string {
  const { host, port } = parseHostEntry(entry);
  const hostPattern = host.startsWith(".")
    ? `(.*\\.)?${escapeRegex(host.slice(1))}`
    : escapeRegex(host);
  return `^${hostPattern}:${port ?? "\\d+"}$`;
}

/**
 * Polls the given port until a TCP connection succeeds or the timeout expires.
 */
function waitForPort(port: number, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const attempt = () => {
      const socket = net.createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(attempt, 200);
        } else {
          reject(new Error(`mitmdump did not start within ${timeout}ms`));
        }
      });
    };
    attempt();
  });
}

/** Expands a leading "~" so paths coming from the CLI or a configuration file work. */
function expandHome(target: string): string {
  return target.startsWith("~")
    ? path.join(os.homedir(), target.slice(1))
    : target;
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Executable file names to try, honouring Windows executable extensions. */
function mitmdumpFileNames(): string[] {
  if (process.platform !== "win32") return ["mitmdump"];
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);
  return extensions.map((ext) => `mitmdump${ext}`);
}

function findMitmdumpIn(directories: string[]): string | undefined {
  const names = mitmdumpFileNames();
  for (const directory of directories) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(expandHome(directory), name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Scripts/bin directories of every Python installation found under `root`. */
function pythonScriptDirectories(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const binDir = process.platform === "win32" ? "Scripts" : "bin";
  return entries
    .filter((entry) => entry.isDirectory() && /^Python/i.test(entry.name))
    .map((entry) => path.join(root, entry.name, binDir));
}

/**
 * Directories where mitmdump commonly lands when it is not on PATH.
 *
 * The Windows installer does not always register itself in PATH, and pip/pipx
 * installs land in per-user script directories that are not on PATH either.
 */
function wellKnownMitmdumpDirectories(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    const roamingAppData =
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return [
      // Windows installer (per-user and machine-wide)
      path.join(localAppData, "Programs", "mitmproxy", "bin"),
      ...[process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
        .filter((dir): dir is string => Boolean(dir))
        .map((dir) => path.join(dir, "mitmproxy", "bin")),
      // pipx and pip --user shims
      path.join(home, ".local", "bin"),
      // pip installs into a Python distribution
      ...pythonScriptDirectories(path.join(localAppData, "Programs", "Python")),
      ...pythonScriptDirectories(path.join(roamingAppData, "Python")),
    ];
  }
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/snap/bin",
    path.join(home, ".local", "bin"),
    ...pythonScriptDirectories(path.join(home, "Library", "Python")),
  ];
}

/**
 * Resolves the mitmdump executable.
 *
 * Order of precedence: the explicit path (CLI option or configuration file),
 * PATH, and finally the well-known installation directories of each platform.
 *
 * @throws when no executable can be found, or when an explicit path is invalid.
 */
export function resolveMitmdump(explicitPath?: string): string {
  if (explicitPath) {
    const resolved = path.resolve(expandHome(explicitPath));
    if (isFile(resolved)) return resolved;
    // A directory is accepted as a convenience: point at it, get the binary inside.
    const inDirectory = findMitmdumpIn([resolved]);
    if (inDirectory) return inDirectory;
    throw new Error(`mitmdump not found at the configured path: ${explicitPath}`);
  }

  const pathDirectories = (process.env.PATH ?? "").split(path.delimiter);
  const wellKnownDirectories = wellKnownMitmdumpDirectories();
  const found =
    findMitmdumpIn(pathDirectories) ?? findMitmdumpIn(wellKnownDirectories);
  if (found) return found;

  throw new Error(
    "mitmdump not found in PATH nor in the usual installation directories.\n" +
      "  Install it from https://docs.mitmproxy.org/stable/overview/installation/,\n" +
      "  or point clsniff at it with --mitmdump <path> or the \"mitmdump\" configuration key.\n" +
      `  Looked in: ${wellKnownDirectories.join(", ")}`
  );
}

/**
 * Starts mitmdump as a subprocess and returns a handle to manage it.
 *
 * mitmdump generates its CA certificate in ~/.mitmproxy/ on first run.
 * The logger.py addon script handles all request/response capture.
 */
export async function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
  const mitmdumpExecutable = resolveMitmdump(options.mitmdumpPath);
  const mitmproxyHome = path.join(os.homedir(), ".mitmproxy");
  const caPath = path.join(mitmproxyHome, "mitmproxy-ca-cert.pem");
  const caIsNew = !fs.existsSync(caPath);

  // logger.py sits next to this module in the package root (one level up from dist/)
  const loggerPath = path.join(__dirname, "..", "logger.py");

  const port =
    options.port && options.port > 0 ? options.port : await findFreePort();

  const args: string[] = [
    "--listen-host", "127.0.0.1",
    "--listen-port", String(port),
    "-s", loggerPath,
    "--set", "connection_strategy=lazy",
    // Do not verify upstream certificates. clsniff is a sniffer, not a security boundary:
    // the child already trusts the proxy CA unconditionally, so verifying the real server
    // adds nothing and only breaks local endpoints with self-signed certificates (a
    // development MCP server on https://localhost, for instance), which mitmdump would
    // otherwise reject with "502 Bad Gateway - Certificate verify failed".
    "--ssl-insecure",
    "--quiet",
  ];

  for (const entry of options.exclude) {
    args.push("--ignore-hosts", hostEntryToRegex(entry));
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLSNIFF_SESSION_DIR: options.sessionDir,
    CLSNIFF_LOG_FILE: options.logFile,
    CLSNIFF_MASK_HEADERS: options.maskHeaders.join(","),
    CLSNIFF_EXCLUDE_URL: JSON.stringify(options.excludeUrl),
    CLSNIFF_EXCLUDE: JSON.stringify(options.exclude),
  };

  const mitmdump = spawn(mitmdumpExecutable, args, {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  mitmdump.stderr?.on("data", (chunk: Buffer) => {
    options.onError?.(chunk.toString().trim());
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    mitmdump.on("error", (err) => {
      if (!settled) {
        settled = true;
        const message =
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? `mitmdump could not be executed at ${mitmdumpExecutable}. See https://docs.mitmproxy.org/stable/overview/installation/`
            : err.message;
        reject(new Error(message));
      } else {
        options.onError?.(err.message);
      }
    });

    mitmdump.on("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(`mitmdump exited unexpectedly (${code ?? signal})`)
        );
      }
    });

    waitForPort(port)
      .then(() => {
        if (!settled) {
          settled = true;
          resolve({
            port,
            caPath,
            caIsNew,
            close: () => mitmdump.kill(),
          });
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          mitmdump.kill();
          reject(err);
        }
      });
  });
}
