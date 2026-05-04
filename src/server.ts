import express from "express";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { exec } from "child_process";

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

interface SessionInfo {
  name: string;
  entryCount: number;
  createdAt: string;
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
    sessions.push({ name: entry.name, entryCount: files.length, createdAt });
  }
  // Most recent first
  sessions.sort((a, b) => b.name.localeCompare(a.name));
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
  const port = await findFreePort();
  const app = express();

  // Serve static viewer files
  const viewerDist = path.join(__dirname, "..", "viewer", "dist");
  if (fs.existsSync(viewerDist)) {
    app.use(express.static(viewerDist));
  }

  app.use(express.json());

  let paused = false;

  function activeSessionDir(): string | null {
    if (!options.activeSession) return null;
    const dir = path.join(options.outputDir, options.activeSession);
    return fs.existsSync(dir) ? dir : null;
  }

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
    const search = searchStr ? new RegExp(searchStr, "im") : null;
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
      const raw = fs.readFileSync(filePath, "utf-8");
      if (req.query["download"] === "true") {
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/json");
        res.send(raw);
      } else {
        res.json(JSON.parse(raw));
      }
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

    // Keep-alive ping every 15s
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);

    // Watch output directory for new files
    let watcher: fs.FSWatcher | null = null;
    const seenRecently = new Set<string>();

    if (fs.existsSync(options.outputDir)) {
      try {
        watcher = fs.watch(
          options.outputDir,
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
      clearInterval(ping);
      watcher?.close();
    });
  });

  // SPA fallback — serve index.html for any non-API route
  app.get("*", (_req, res) => {
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
