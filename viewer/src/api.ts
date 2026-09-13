import type { AppInfo, Session, EntrySummary, Entry, MatchEntry } from "./types";

export async function fetchInfo(): Promise<AppInfo> {
  const res = await fetch("/api/info");
  if (!res.ok) throw new Error("Failed to fetch info");
  return res.json() as Promise<AppInfo>;
}

/** Asks the server to show the output directory (or one session) in the OS file manager. */
export async function revealInFileManager(session?: string): Promise<void> {
  const res = await fetch("/api/reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session ? { session } : {}),
  });
  if (!res.ok) throw new Error("Failed to open the file manager");
}

export async function fetchSessions(): Promise<{
  sessions: Session[];
  activeSession: string | null;
  outputDir: string;
}> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json() as Promise<{ sessions: Session[]; activeSession: string | null; outputDir: string }>;
}

/**
 * Renames a session folder. Returns the resulting name, and throws with the
 * server-provided reason when the rename is rejected.
 */
export async function renameSession(name: string, newName: string): Promise<string> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(name)}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  const data = (await res.json().catch(() => null)) as
    | { name?: string; error?: string }
    | null;
  if (!res.ok) throw new Error(data?.error ?? "Failed to rename the session");
  return data?.name ?? newName;
}

export async function fetchEntries(
  sessionName: string,
  search?: string,
  regex = false
): Promise<EntrySummary[]> {
  const qs = search
    ? `?search=${encodeURIComponent(search)}${regex ? "&regex=1" : ""}`
    : "";
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/entries${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch entries for ${sessionName}`);
  const data = (await res.json()) as { entries: EntrySummary[] };
  return data.entries.map((e) => ({ ...e, sessionName }));
}

export async function fetchMatches(
  sessionName: string,
  search: string,
  regex = false
): Promise<MatchEntry[]> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionName)}/matches?search=${encodeURIComponent(search)}${
      regex ? "&regex=1" : ""
    }`
  );
  if (!res.ok) throw new Error(`Failed to fetch matches for ${sessionName}`);
  const data = (await res.json()) as { entries: MatchEntry[] };
  return data.entries.map((e) => ({ ...e, sessionName }));
}

export async function fetchEntry(
  sessionName: string,
  filename: string
): Promise<Entry> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionName)}/entries/${encodeURIComponent(filename)}`
  );
  if (!res.ok) throw new Error("Failed to fetch entry");
  return res.json() as Promise<Entry>;
}

export async function fetchLoggingStatus(): Promise<{ paused: boolean }> {
  const res = await fetch("/api/logging/status");
  if (!res.ok) throw new Error("Failed to fetch logging status");
  return res.json() as Promise<{ paused: boolean }>;
}

export async function setLoggingPaused(paused: boolean): Promise<{ paused: boolean }> {
  const res = await fetch(paused ? "/api/logging/pause" : "/api/logging/resume", { method: "POST" });
  if (!res.ok) throw new Error("Failed to update logging state");
  return res.json() as Promise<{ paused: boolean }>;
}
