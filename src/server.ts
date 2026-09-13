import express from "express";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { exec, execFile } from "child_process";

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
) as { version: string };

export interface ViewerOptions {
  outputDir: string;
  /** Pre-select this session when opened alongside the proxy. */
  activeSession?: string;
  /** Whether to auto-open the default browser. */
  open: boolean;
}

export interface ViewerHandle {
  port: number;
  url: string;
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

function openBrowser(url: string): void {
  let cmd: string;
  if (process.platform === "win32") {
    cmd = `start "" "${url}"`;
  } else if (process.platform === "darwin") {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd);
}

// Opens a folder in the OS file manager. execFile takes the path as an argv
// entry instead of a command line, so no shell ever parses it.
function revealInFileManager(target: string): void {
  if (process.platform === "win32") {
    execFile("explorer.exe", [target], () => {});
  } else if (process.platform === "darwin") {
    execFile("open", [target], () => {});
  } else {
    execFile("xdg-open", [target], () => {});
  }
}

interface SessionInfo {
  name: string;
  entryCount: number;
  createdAt: string;
  /** True when clsniff named the folder itself, false when the name is the user's. */
  generated: boolean;
}

interface EntrySummary {
  id: number;
  timestamp: string;
  duration_ms: number;
  method: string;
  url: string;
  status: number;
  status_reason: string | null;
  filename: string;
}

/** One occurrence: the physical raw-JSON line it falls on, split for highlighting. */
interface MatchHunk {
  before: string;
  match: string;
  after: string;
  /** 1-based line/column of the match in the raw file (for editor deep-links). */
  line: number;
  column: number;
}

interface MatchEntry extends EntrySummary {
  hunks: MatchHunk[];
}

/**
 * Escape a string so it can be embedded in a RegExp and matched literally.
 * Used when the client requests a plain (non-regex) search.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the search RegExp from the raw query string, treating it literally
 * unless `useRegex` is set. Throws if `useRegex` is set and the pattern is
 * invalid; the caller is expected to handle that (e.g. respond 400).
 */
function buildSearchRegex(searchStr: string, useRegex: boolean, flags: string): RegExp {
  return new RegExp(useRegex ? searchStr : escapeRegExp(searchStr), flags);
}

/**
 * Find every occurrence of `regex` in `raw` and return, per match, the physical
 * line of the file it falls on, split into { before, match, after }. The line is
 * returned verbatim (no clipping/unescaping) so it mirrors what the raw detail
 * view shows; word-wrap on the client keeps long lines readable.
 */
function extractHunks(raw: string, regex: RegExp): MatchHunk[] {
  const hunks: MatchHunk[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  // Track the 1-based line number incrementally: matches arrive in ascending
  // order, so we only ever scan each character once across the whole loop.
  let line = 1;
  let scanned = 0;
  while ((m = regex.exec(raw)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    for (let k = scanned; k < start; k++) if (raw.charCodeAt(k) === 10) line++;
    scanned = start;
    const lineStart = raw.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = raw.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = raw.length;
    hunks.push({
      before: raw.slice(lineStart, start),
      match: m[0],
      after: raw.slice(end, lineEnd),
      line,
      column: start - lineStart + 1,
    });
    // Guard against zero-length matches (e.g. patterns that can match empty).
    if (m[0].length === 0) regex.lastIndex++;
  }
  return hunks;
}

// Characters no session folder may contain. Besides the path separators, the
// Windows-reserved set is rejected on every platform so a session renamed on
// Linux still copies over to a Windows machine.
const INVALID_NAME_CHARS = /[<>:"/\\|?*]/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function hasControlChars(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return true;
  }
  return false;
}

/** Returns an error message when `name` cannot be a session folder, or null when it can. */
function validateSessionName(name: string): string | null {
  if (!name) return "The name cannot be empty";
  if (name.length > 120) return "The name is too long (120 characters max)";
  if (name === "." || name === "..") return "Invalid name";
  if (INVALID_NAME_CHARS.test(name) || hasControlChars(name)) {
    return 'The name cannot contain < > : " / \\ | ? *';
  }
  if (/[. ]$/.test(name)) return "The name cannot end with a dot or a space";
  if (RESERVED_NAMES.test(name)) return `"${name}" is a reserved name`;
  return null;
}

/**
 * Whether both paths point at the same directory. On a case-insensitive
 * filesystem a case-only rename resolves to the existing folder, which must not
 * be reported as a name collision.
 */
function isSameDir(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

// Folder names clsniff generates itself: the ISO timestamp of the run with ":" and
// "." replaced (see the session name built in cli.ts). Anything else was named by
// the user, with --name or by renaming the session from the viewer.
const GENERATED_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

function listSessions(outputDir: string): SessionInfo[] {
  if (!fs.existsSync(outputDir)) return [];
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  const sessions: SessionInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(outputDir, entry.name);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    let createdAt = "";
    try {
      const stat = fs.statSync(dir);
      createdAt = stat.birthtime.toISOString();
    } catch {
      createdAt = new Date().toISOString();
    }
    sessions.push({
      name: entry.name,
      entryCount: files.length,
      createdAt,
      generated: GENERATED_NAME.test(entry.name),
    });
  }
  // Named sessions first and alphabetically, since a name carries no date. Generated
  // ones follow, most recent first: their names are timestamps, so ordering them by
  // name descending is ordering them chronologically.
  sessions.sort((a, b) => {
    if (a.generated !== b.generated) return a.generated ? 1 : -1;
    return a.generated
      ? b.name.localeCompare(a.name)
      : a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sessions;
}

function loadEntrySummary(
  sessionDir: string,
  filename: string
): EntrySummary | null {
  const filePath = path.join(sessionDir, filename);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      id: parsed.id,
      timestamp: parsed.timestamp,
      duration_ms: parsed.duration_ms,
      method: parsed.request?.method ?? "",
      url: parsed.request?.url ?? "",
      status: parsed.response?.status ?? 0,
      status_reason: parsed.response?.status_reason ?? null,
      filename,
    };
  } catch {
    return null;
  }
}

export async function startViewer(options: ViewerOptions): Promise<ViewerHandle> {
  // The /api/events watcher can only attach to a directory that already exists, so a
  // viewer opened before the very first capture would never go live. Creating it up
  // front costs nothing: a capture would create it moments later anyway.
  try {
    fs.mkdirSync(options.outputDir, { recursive: true });
  } catch {
    // an unwritable output directory still lists and serves nothing, as before
  }

  const envPort = parseInt(process.env["CLSNIFF_SERVER_PORT"] ?? "", 10);
  const port = envPort > 0 ? envPort : await findFreePort();
  const app = express();

  // Serve static viewer files
  const viewerDist = path.join(__dirname, "..", "viewer", "dist");
  if (fs.existsSync(viewerDist)) {
    app.use(express.static(viewerDist));
  }

  app.use(express.json());

  let paused = false;

  // Every open /api/events stream, so a change driven by the API (a rename)
  // also reaches the clients that did not trigger it.
  type SseSend = (type: string, data: object) => void;
  const sseClients = new Set<SseSend>();
  const broadcast: SseSend = (type, data) => {
    for (const send of sseClients) {
      try {
        send(type, data);
      } catch {
        // a dead stream is dropped by its own close handler
      }
    }
  };

  function activeSessionDir(): string | null {
    if (!options.activeSession) return null;
    const dir = path.join(options.outputDir, options.activeSession);
    return fs.existsSync(dir) ? dir : null;
  }

  // GET /api/info
  app.get("/api/info", (_req, res) => {
    res.json({
      version,
      platform: process.platform,
      outputDir: options.outputDir,
      activeSession: options.activeSession ?? null,
    });
  });

  // POST /api/reveal - show the output directory, or one session folder,
  // in the OS file manager. The client picks a target, never a path: anything
  // reachable from the browser could POST here, so paths are resolved server
  // side and confined to outputDir.
  app.post("/api/reveal", (req, res) => {
    const session = (req.body as { session?: unknown } | undefined)?.session;
    let target = options.outputDir;
    if (typeof session === "string" && session) {
      target = path.join(options.outputDir, path.basename(session));
    }
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: "Path not found" });
      return;
    }
    revealInFileManager(target);
    res.json({ revealed: target });
  });

  // GET /api/logging/status
  app.get("/api/logging/status", (_req, res) => {
    res.json({ paused: paused });
  });

  // POST /api/logging/pause
  app.post("/api/logging/pause", async (_req, res) => {
    const dir = activeSessionDir();
    if (dir) await fs.promises.writeFile(path.join(dir, ".paused"), "").catch(() => {});
    paused = true;
    res.json({ paused: true });
  });

  // POST /api/logging/resume
  app.post("/api/logging/resume", async (_req, res) => {
    const dir = activeSessionDir();
    if (dir) await fs.promises.rm(path.join(dir, ".paused"), { force: true }).catch(() => {});
    paused = false;
    res.json({ paused: false });
  });

  // GET /api/sessions
  app.get("/api/sessions", (_req, res) => {
    try {
      const sessions = listSessions(options.outputDir);
      res.json({
        sessions,
        activeSession: options.activeSession ?? null,
        outputDir: options.outputDir,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/sessions/:name/rename - rename a session folder. Any session can be
  // renamed except the one currently being recorded: the addon resolved its output
  // directory at startup and would keep writing to the old path.
  app.post("/api/sessions/:name/rename", (req, res) => {
    const current = path.basename(req.params.name);
    const raw = (req.body as { name?: unknown } | undefined)?.name;
    const newName = typeof raw === "string" ? raw.trim() : "";

    const invalid = validateSessionName(newName);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const from = path.join(options.outputDir, current);
    if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (options.activeSession && current === options.activeSession) {
      res.status(409).json({ error: "The session being recorded cannot be renamed" });
      return;
    }
    if (newName === current) {
      res.json({ name: newName });
      return;
    }

    const to = path.join(options.outputDir, newName);
    if (fs.existsSync(to) && !isSameDir(from, to)) {
      res.status(409).json({ error: `A session named "${newName}" already exists` });
      return;
    }

    try {
      fs.renameSync(from, to);
    } catch (err) {
      // A folder another clsniff process is recording into holds an open handle on
      // its clsniff.log, so Windows rejects the rename instead of letting us break
      // that capture. Report it as a busy folder rather than as a raw errno.
      const code = (err as NodeJS.ErrnoException).code;
      const busy = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      res.status(busy ? 409 : 500).json({
        error: busy
          ? "The session folder is in use, possibly by another clsniff run recording into it"
          : `Could not rename the session: ${String(err)}`,
      });
      return;
    }

    broadcast("session-renamed", { from: current, to: newName });
    res.json({ name: newName });
  });

  // GET /api/sessions/:name/entries?search=term
  app.get("/api/sessions/:name/entries", (req, res) => {
    const sessionDir = path.join(options.outputDir, req.params.name);
    if (!fs.existsSync(sessionDir)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const searchStr =
      typeof req.query["search"] === "string"
        ? req.query["search"].trim()
        : "";
    const useRegex = req.query["regex"] === "1";
    let search: RegExp | null = null;
    if (searchStr) {
      try {
        search = buildSearchRegex(searchStr, useRegex, "im");
      } catch {
        res.status(400).json({ error: "Invalid search pattern" });
        return;
      }
    }
    try {
      const files = fs
        .readdirSync(sessionDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      const summaries: EntrySummary[] = [];
      for (const file of files) {
        if (search) {
          // Full-content search: read the raw file and check before parsing
          const raw = fs.readFileSync(path.join(sessionDir, file), "utf-8");
          if (!search.test(raw)) continue;
          try {
            const parsed = JSON.parse(raw);
            summaries.push({
              id: parsed.id,
              timestamp: parsed.timestamp,
              duration_ms: parsed.duration_ms,
              method: parsed.request?.method ?? "",
              url: parsed.request?.url ?? "",
              status: parsed.response?.status ?? 0,
              status_reason: parsed.response?.status_reason ?? null,
              filename: file,
            });
          } catch { /* skip malformed */ }
        } else {
          const summary = loadEntrySummary(sessionDir, file);
          if (summary) summaries.push(summary);
        }
      }
      res.json({ entries: summaries });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/sessions/:name/matches?search=term
  // Returns, per matching file, its summary plus one "hunk" per occurrence:
  // the physical line of the raw .json where the match falls, split into
  // { before, match, after } so the client can highlight without re-running
  // the regex. Operates on the raw file, so every server-side match is shown.
  app.get("/api/sessions/:name/matches", (req, res) => {
    const sessionDir = path.join(options.outputDir, req.params.name);
    if (!fs.existsSync(sessionDir)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const searchStr =
      typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
    if (!searchStr) {
      res.json({ entries: [] });
      return;
    }
    const useRegex = req.query["regex"] === "1";
    let regex: RegExp;
    try {
      regex = buildSearchRegex(searchStr, useRegex, "gim");
    } catch {
      res.status(400).json({ error: "Invalid search pattern" });
      return;
    }
    try {
      const files = fs
        .readdirSync(sessionDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      const entries: MatchEntry[] = [];
      for (const file of files) {
        const raw = fs.readFileSync(path.join(sessionDir, file), "utf-8");
        const hunks = extractHunks(raw, regex);
        if (hunks.length === 0) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue; // skip malformed
        }
        const request = parsed["request"] as Record<string, unknown> | undefined;
        const response = parsed["response"] as Record<string, unknown> | undefined;
        entries.push({
          id: parsed["id"] as number,
          timestamp: parsed["timestamp"] as string,
          duration_ms: parsed["duration_ms"] as number,
          method: (request?.["method"] as string) ?? "",
          url: (request?.["url"] as string) ?? "",
          status: (response?.["status"] as number) ?? 0,
          status_reason: (response?.["status_reason"] as string) ?? null,
          filename: file,
          hunks,
        });
      }
      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/sessions/:name/entries/:filename
  app.get("/api/sessions/:name/entries/:filename", (req, res) => {
    // Sanitize: filename must be a plain .json file, no path traversal
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith(".json")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    const filePath = path.join(options.outputDir, req.params.name, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    try {
      res.json(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/events — SSE for live updates
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (type: string, data: object) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    sseClients.add(send);

    // Keep-alive ping every 15s
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);

    // Watch output directory for new files
    let watcher: fs.FSWatcher | null = null;
    const seenRecently = new Set<string>();

    if (fs.existsSync(options.outputDir)) {
      try {
        // Watch the canonical path: on Windows, fs.watch aborts the process when
        // a directory is renamed under a path given in 8.3 short-name form,
        // because the events report the long name and no longer match it.
        let watchRoot = options.outputDir;
        try {
          watchRoot = fs.realpathSync.native(options.outputDir);
        } catch {
          // keep the configured path when it cannot be resolved
        }
        watcher = fs.watch(
          watchRoot,
          { recursive: true },
          (event, filename) => {
            if (!filename || !filename.endsWith(".json")) return;
            if (seenRecently.has(filename)) return;
            seenRecently.add(filename);
            setTimeout(() => seenRecently.delete(filename), 100);

            // filename is like "sessionName/epochMs_id.json" or just "epochMs_id.json"
            const parts = filename.replace(/\\/g, "/").split("/");
            if (parts.length === 2) {
              const [sessionName, file] = parts;
              send("new-entry", { session: sessionName, filename: file });
            } else if (parts.length === 1) {
              // New session folder detected (directory rename event)
              send("new-session", { session: parts[0] });
            }
          }
        );
      } catch {
        // fs.watch may fail on some systems; silently ignore
      }
    }

    req.on("close", () => {
      sseClients.delete(send);
      clearInterval(ping);
      watcher?.close();
    });
  });

  // SPA fallback — serve index.html for any non-API route
  // ("/*splat" is the Express 5 / path-to-regexp 8 spelling of the old "*")
  app.get("/*splat", (_req, res) => {
    const indexPath = path.join(viewerDist, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(503).send(
        "Viewer not built. Run: npm run build:viewer"
      );
    }
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      if (options.open) {
        openBrowser(url);
      }
      resolve({
        port,
        url,
        close: () => server.close(),
      });
    });
    server.once("error", reject);
  });
}
