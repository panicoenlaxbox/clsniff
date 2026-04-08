import { Proxy } from "http-mitm-proxy";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";

export interface ProxyOptions {
  /** Port to listen on. Use 0 for OS auto-assign (default). */
  port?: number;
  /** Directory for session JSON log files. */
  sessionDir: string;
  /** If true, SSE events are merged into a single body string instead of kept as an array. */
  mergeSse: boolean;
  /**
   * Header names to redact in the JSON output (case-insensitive).
   * Their values are replaced with "***". The actual traffic is never modified.
   */
  maskHeaders: string[];
  /**
   * URL regex filters. Only requests whose full URL matches at least one pattern are logged.
   * If empty, all requests are logged.
   */
  filters: RegExp[];
  /**
   * URL regex excludes. Requests whose full URL matches any of these patterns are never logged,
   * even if they also match a --filter pattern. Evaluated after filters.
   */
  excludes: RegExp[];
  /** Called on proxy errors so the caller can route them to a log file. */
  onError?: (url: string, kind: string, message: string) => void;
}

export interface ProxyHandle {
  port: number;
  /** Absolute path to the generated CA certificate (PEM). */
  caPath: string;
  /** Whether the CA certificate was freshly generated this run. */
  caIsNew: boolean;
  close(): void;
}

interface SseEvent {
  event?: string;
  data?: string;
  id?: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  duration_ms: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    is_sse: boolean;
    body: unknown;
    sse_events: SseEvent[] | null;
  };
}

let requestCounter = 0;

/**
 * Returns a copy of the headers object with sensitive header values replaced by "***".
 * Matching is case-insensitive. The original object and actual HTTP traffic are not affected.
 */
function maskHeaders(
  headers: Record<string, string | string[] | undefined>,
  masked: string[]
): Record<string, string | string[] | undefined> {
  if (!masked.length) {
    return headers;
  }
  const lower = masked.map((h) => h.toLowerCase());
  const result: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = lower.includes(key.toLowerCase()) ? "***" : value;
  }
  return result;
}

/**
 * Attempts to JSON-parse a string. Returns the parsed value on success, or the original
 * string on failure. Returns null for empty/whitespace-only input.
 */
function parseBody(raw: string): unknown {
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Parses a raw SSE stream into an array of events.
 * Each event block is separated by one or more blank lines.
 * Supports `event:`, `data:`, and `id:` fields.
 * `data:` values are JSON-parsed individually when possible.
 */
function parseSseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = raw.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const evt: SseEvent = {};

    for (const line of lines) {
      if (line.startsWith("event:")) {
        evt.event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const chunk = line.slice(5).trim();
        // Append multi-line data values
        evt.data = evt.data !== undefined ? evt.data + "\n" + chunk : chunk;
      } else if (line.startsWith("id:")) {
        evt.id = line.slice(3).trim();
      }
    }

    if (Object.keys(evt).length) {
      // Try to parse data as JSON
      if (evt.data !== undefined) {
        try {
          (evt as SseEvent & { data: unknown }).data = JSON.parse(evt.data);
        } catch {
          // keep as string
        }
      }
      events.push(evt);
    }
  }

  return events;
}

/**
 * Merges SSE events into a single text string by concatenating all data payloads.
 * Understands the Anthropic API delta format (content_block_delta with delta.text).
 * Falls back to raw data concatenation for unknown formats.
 */
function mergeSseBody(events: SseEvent[]): string {
  const parts: string[] = [];

  for (const evt of events) {
    if (evt.data === undefined) {
      continue;
    }

    const data = evt.data as unknown;

    if (typeof data === "object" && data !== null) {
      // Anthropic API: content_block_delta with delta.text
      const d = data as Record<string, unknown>;
      if (d.type === "content_block_delta") {
        const delta = d.delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.text === "string") {
          parts.push(delta.text);
          continue;
        }
      }
    }

    if (typeof data === "string" && data !== "[DONE]") {
      parts.push(data);
    }
  }

  return parts.join("");
}

/**
 * Decompresses a buffer if it's brotli-encoded.
 * The http-mitm-proxy gunzip middleware handles gzip/deflate automatically.
 * Brotli is handled here as a fallback.
 */
async function decompressBrotli(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.brotliDecompress(buf, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Converts http.IncomingMessage headers to a plain object.
 */
function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  return { ...raw };
}

/**
 * Writes a log entry as a formatted JSON file.
 * Filename: NNNN.json (zero-padded sequential ID).
 * Errors are printed to stderr but do not throw.
 */
function writeLog(sessionDir: string, entry: LogEntry): void {
  const filename = path.join(
    sessionDir,
    String(entry.id).padStart(4, "0") + ".json"
  );
  try {
    fs.writeFileSync(filename, JSON.stringify(entry, null, 2), "utf-8");
  } catch (err) {
    process.stderr.write(`[clsniff] failed to write log: ${err}\n`);
  }
}

/**
 * Starts the MITM proxy server.
 *
 * The CA certificate and per-host certificates are stored in ~/.clsniff/
 * and generated automatically on first run.
 */
export function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
  return new Promise((resolve, reject) => {
    const proxy = new Proxy();
    const sslCaDir = path.join(os.homedir(), ".clsniff");

    // Detect if CA cert already exists before starting (to show first-run message)
    const caPath = path.join(sslCaDir, "certs", "ca.pem");
    const caIsNew = !fs.existsSync(caPath);

    // http-mitm-proxy creates per-host HTTPS servers without any ALPN configuration.
    // Some clients (e.g. Node.js undici) fail the TLS handshake when ALPN negotiation has
    // no result. We patch _createHttpsServer to inject an ALPNCallback that always selects
    // http/1.1 (preferred) or the client's first offered protocol as a last resort.
    // This keeps TLS working while keeping the connection on HTTP/1.1.
    const _orig = (proxy as any)._createHttpsServer.bind(proxy);
    (proxy as any)._createHttpsServer = function (
      opts: Record<string, unknown>,
      cb: unknown
    ) {
      // Resolve hostname from opts.hosts for use in error messages
      const hostsArr = Array.isArray(opts.hosts) ? (opts.hosts as string[]) : [];
      const hostname = hostsArr[0] ?? "unknown";

      opts.ALPNCallback = ({
        protocols,
      }: {
        protocols: string[];
      }): string => {
        if (protocols.includes("http/1.1")) {
          return "http/1.1";
        }
        if (protocols.includes("http/1.0")) {
          return "http/1.0";
        }
        // Last resort: echo back whatever the client advertised first.
        // The connection will likely fail at the HTTP framing level (e.g. HTTP/2 frames)
        // but at least TLS completes rather than causing an ALPN alert.
        return protocols[0] ?? "http/1.1";
      };

      // Wrap the callback to replace the generic clientError handler (which logs "(unknown)")
      // with one that includes the actual hostname.
      const wrappedCb = (
        port: number,
        httpsServer: import("https").Server,
        wssServer: unknown
      ) => {
        httpsServer.removeAllListeners("clientError");
        httpsServer.on("clientError", (err: Error) => {
          const hostUrl = `https://${hostname}/`;
          const message = err?.message ?? String(err);
          if (options.onError) {
            options.onError(hostUrl, "HTTPS_CLIENT_ERROR", message);
          } else {
            process.stderr.write(
              `[clsniff] HTTPS_CLIENT_ERROR on ${hostUrl}: ${message}\n`
            );
          }
        });
        (cb as (p: number, s: unknown, w: unknown) => void)(
          port,
          httpsServer,
          wssServer
        );
      };

      return _orig(opts, wrappedCb);
    };

    // Automatically decompress gzip/deflate responses so our handlers see plain text
    proxy.use(Proxy.gunzip);

    proxy.onError((ctx, err, errorKind) => {
      const url = ctx?.clientToProxyRequest?.url ?? "(unknown)";
      const kind = errorKind ?? "error";
      const message = err?.message ?? String(err);
      if (options.onError) {
        options.onError(url, kind, message);
      } else {
        process.stderr.write(`[clsniff] ${kind} on ${url}: ${message}\n`);
      }
    });

    // For excluded hosts, bypass MITM entirely at the CONNECT level by creating a direct
    // TCP tunnel. This prevents creating a fake TLS server for those hosts, which would
    // otherwise cause TLS handshake errors (e.g. HTTP/2-only telemetry endpoints).
    // We do NOT call callback() so the library never proceeds to set up its MITM pipeline.
    if (options.excludes.length) {
      proxy.onConnect((req, socket, head, callback) => {
        const hostname = req.url?.split(":")[0] ?? "";
        const port = parseInt(req.url?.split(":")[1] ?? "443", 10);
        const hostUrl = `https://${hostname}/`;
        const excluded = options.excludes.some((re) => re.test(hostUrl));

        if (!excluded) {
          return callback();
        }

        // Direct tunnel: connect to the real server and pipe sockets
        const conn = net.createConnection({ host: hostname, port }, () => {
          socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
          if (head?.length) {
            conn.write(head);
          }
          conn.pipe(socket);
          socket.pipe(conn);
        });
        conn.on("error", () => socket.destroy());
        socket.on("error", () => conn.destroy());
        // Do NOT call callback() — prevents the library from running its MITM setup
      });
    }

    proxy.onRequest((ctx, callback) => {
      const startTime = Date.now();

      // Build full URL for filtering
      const proto = ctx.isSSL ? "https" : "http";
      const host = ctx.clientToProxyRequest.headers.host ?? "unknown";
      const urlPath = ctx.clientToProxyRequest.url ?? "/";
      const fullUrl = `${proto}://${host}${urlPath}`;

      // Skip logging if URL doesn't match any --filter (traffic still passes through)
      if (options.filters.length) {
        const matches = options.filters.some((re) => re.test(fullUrl));
        if (!matches) {
          return callback();
        }
      }

      // Skip logging if URL matches any --exclude (takes precedence over --filter)
      if (options.excludes.length) {
        const excluded = options.excludes.some((re) => re.test(fullUrl));
        if (excluded) {
          return callback();
        }
      }

      const reqChunks: Buffer[] = [];
      const resChunks: Buffer[] = [];

      // Buffer request body chunks while passing them through unchanged
      ctx.onRequestData((_ctx, chunk, cb) => {
        reqChunks.push(chunk);
        return cb(null, chunk);
      });

      // Buffer response body chunks while passing them through immediately.
      // Passing chunks through in real-time is essential for SSE/streaming responses.
      ctx.onResponseData((_ctx, chunk, cb) => {
        resChunks.push(chunk);
        return cb(null, chunk);
      });

      ctx.onResponseEnd((ctx, cb) => {
        (async () => {
          try {
            const response = ctx.serverToProxyResponse;
            const contentEncoding =
              response?.headers["content-encoding"] ?? "";
            const contentType = response?.headers["content-type"] ?? "";
            const statusCode = response?.statusCode ?? 0;

            // Assemble buffered data
            let rawReqBody: Buffer = Buffer.concat(reqChunks) as Buffer;
            let rawResBody: Buffer = Buffer.concat(resChunks) as Buffer;

            // Handle brotli separately (gunzip middleware only covers gzip/deflate)
            if (
              typeof contentEncoding === "string" &&
              contentEncoding.includes("br")
            ) {
              try {
                rawResBody = await decompressBrotli(rawResBody);
              } catch {
                // If decompression fails, keep as-is
              }
            }

            const reqBodyStr = rawReqBody.toString("utf-8");
            const resBodyStr = rawResBody.toString("utf-8");

            const isSse =
              typeof contentType === "string" &&
              contentType.includes("text/event-stream");

            let responseBody: unknown = null;
            let sseEvents: SseEvent[] | null = null;

            if (isSse) {
              const events = parseSseEvents(resBodyStr);
              if (options.mergeSse) {
                responseBody = mergeSseBody(events);
                sseEvents = null;
              } else {
                responseBody = null;
                sseEvents = events;
              }
            } else {
              responseBody = parseBody(resBodyStr);
            }

            const reqContentType =
              ctx.clientToProxyRequest.headers["content-type"] ?? "";
            const requestBody = parseBody(
              typeof reqContentType === "string" &&
                reqContentType.includes("application/x-www-form-urlencoded")
                ? reqBodyStr
                : reqBodyStr
            );

            const id = ++requestCounter;
            const entry: LogEntry = {
              id,
              timestamp: new Date().toISOString(),
              duration_ms: Date.now() - startTime,
              request: {
                method: ctx.clientToProxyRequest.method ?? "GET",
                url: fullUrl,
                headers: maskHeaders(
                  normalizeHeaders(
                    ctx.clientToProxyRequest
                      .headers as Record<string, string | string[] | undefined>
                  ),
                  options.maskHeaders
                ),
                body: requestBody,
              },
              response: {
                status: statusCode,
                headers: maskHeaders(
                  normalizeHeaders(
                    (response?.headers ?? {}) as Record<
                      string,
                      string | string[] | undefined
                    >
                  ),
                  options.maskHeaders
                ),
                is_sse: isSse,
                body: responseBody,
                sse_events: sseEvents,
              },
            };

            writeLog(options.sessionDir, entry);
          } catch (err) {
            process.stderr.write(
              `[clsniff] error processing response for ${fullUrl}: ${err}\n`
            );
          }

          return cb();
        })();
      });

      return callback();
    });

    // If a specific port was requested, verify it's available before handing off to
    // http-mitm-proxy, which doesn't register an error handler on httpServer and would
    // otherwise let EADDRINUSE crash the process as an uncaughtException.
    const checkPort = options.port
      ? new Promise<void>((res, rej) => {
          const tester = net.createServer();
          tester.once("error", (err: NodeJS.ErrnoException) => {
            rej(
              err.code === "EADDRINUSE"
                ? new Error(`Port ${options.port} is already in use`)
                : err
            );
          });
          tester.listen(options.port, "127.0.0.1", () => tester.close(() => res()));
        })
      : Promise.resolve();

    checkPort.then(() => {
    // Explicitly bind to IPv4 loopback to avoid IPv6/IPv4 mismatches on Windows
    proxy.listen({ port: options.port ?? 0, host: "127.0.0.1", sslCaDir }, () => {
      resolve({
        port: proxy.httpPort,
        caPath,
        caIsNew,
        close: () => proxy.close(),
      });
    });
    }, reject);
  });
}
