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
  /** NO_PROXY-style host entries to bypass (e.g. "localhost", ".example.com"). */
  excludes: string[];
  /** Path to the clsniff.log file. */
  logFile: string;
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

/**
 * Converts a NO_PROXY-style host entry to a regex pattern suitable for
 * mitmdump's --ignore-hosts option (which uses re.fullmatch against the hostname).
 *
 * Examples:
 *   "localhost"              → "localhost"
 *   "127.0.0.1"             → "127\\.0\\.0\\.1"
 *   ".example.com"          → "(.*\\.)?example\\.com"
 *   "api.anthropic.com"     → "api\\.anthropic\\.com"
 */
function hostEntryToRegex(entry: string): string {
  if (entry.startsWith(".")) {
    const escaped = entry.slice(1).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return `(.*\\.)?${escaped}`;
  }
  return entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
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

/**
 * Starts mitmdump as a subprocess and returns a handle to manage it.
 *
 * mitmdump generates its CA certificate in ~/.mitmproxy/ on first run.
 * The logger.py addon script handles all request/response capture.
 */
export async function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
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
    "--quiet",
  ];

  for (const entry of options.excludes) {
    args.push("--ignore-hosts", hostEntryToRegex(entry));
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLSNIFF_SESSION_DIR: options.sessionDir,
    CLSNIFF_LOG_FILE: options.logFile,
    CLSNIFF_MASK_HEADERS: options.maskHeaders.join(","),
  };

  const mitmdump = spawn("mitmdump", args, {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    mitmdump.on("error", (err) => {
      if (!settled) {
        settled = true;
        const message =
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? "mitmdump not found in PATH. Install it with: pip install mitmproxy"
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
