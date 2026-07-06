export interface Session {
  name: string;
  entryCount: number;
  createdAt: string;
}

export interface EntrySummary {
  id: number;
  timestamp: string;
  duration_ms: number;
  method: string;
  url: string;
  status: number;
  status_reason: string | null;
  filename: string;
  /** Added client-side to track which session this came from */
  sessionName: string;
}

/** One occurrence within a file: the raw-JSON line it falls on, split for highlighting. */
export interface MatchHunk {
  before: string;
  match: string;
  after: string;
  /** 1-based line/column of the match in the raw file (for editor deep-links). */
  line: number;
  column: number;
}

export interface MatchEntry extends EntrySummary {
  hunks: MatchHunk[];
}

export interface Entry {
  id: number;
  timestamp: string;
  duration_ms: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response: {
    status: number;
    status_reason: string | null;
    headers: Record<string, string>;
    body: unknown;
  };
}
