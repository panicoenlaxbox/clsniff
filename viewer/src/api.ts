import type { Session, EntrySummary, Entry } from "./types";

export async function fetchSessions(): Promise<{
  sessions: Session[];
  activeSession: string | null;
  outputDir: string;
}> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json() as Promise<{ sessions: Session[]; activeSession: string | null; outputDir: string }>;
}

export async function fetchEntries(
  sessionName: string,
  search?: string
): Promise<EntrySummary[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/entries${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch entries for ${sessionName}`);
  const data = (await res.json()) as { entries: EntrySummary[] };
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
