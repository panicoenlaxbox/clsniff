import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, EntrySummary, Session } from "./types";
import { fetchEntry, fetchEntries, fetchSessions } from "./api";
import SessionSelector from "./components/SessionSelector";
import SearchBar from "./components/SearchBar";
import EntryTable from "./components/EntryTable";
import DetailView from "./components/DetailView";
import { useTheme } from "./hooks/useTheme";
import type { Theme } from "./hooks/useTheme";

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
      </svg>
    );
  }
  // system
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4zm1.398-.855a.758.758 0 0 0-.254.302A1.46 1.46 0 0 0 1 4.01V10c0 .325.078.502.145.602.07.105.17.188.302.254a1.464 1.464 0 0 0 .538.143L2.01 11H14c.325 0 .502-.078.602-.145a.758.758 0 0 0 .254-.302 1.464 1.464 0 0 0 .143-.538L15 9.99V4c0-.325-.078-.502-.145-.602a.757.757 0 0 0-.302-.254A1.46 1.46 0 0 0 13.99 3H2c-.325 0-.502.078-.602.145z"/>
    </svg>
  );
}

export default function App() {
  const { theme, cycle } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<EntrySummary | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [wordWrap, setWordWrap] = useState(false);
  const [leftWidth, setLeftWidth] = useState(40);
  const [totalUnfiltered, setTotalUnfiltered] = useState(0);
  const [outputDir, setOutputDir] = useState("");
  const resizing = useRef(false);

  // ── Load sessions ───────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const { sessions: list, activeSession, outputDir: dir } = await fetchSessions();
      setOutputDir(dir ?? "");
      setSessions(list);
      setSelectedSessions((prev) => {
        if (prev.length > 0) return prev;
        if (activeSession && list.some((s) => s.name === activeSession)) {
          return [activeSession];
        }
        if (list.length > 0) return [list[0].name];
        return [];
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // ── Load entries (with optional server-side search) ─────────────────────────
  const loadEntries = useCallback(async (sessionNames: string[], search: string) => {
    if (sessionNames.length === 0) {
      setEntries([]);
      return;
    }
    try {
      const results = await Promise.all(
        sessionNames.map((s) => fetchEntries(s, search || undefined))
      );
      const merged = results
        .flat()
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setEntries(merged);
      if (!search) setTotalUnfiltered(merged.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadEntries(selectedSessions, searchTerm);
    setSelectedKey(null);
    setSelectedSummary(null);
    setEntry(null);
  }, [selectedSessions, searchTerm, loadEntries]);

  // ── SSE for live updates (only when not searching) ──────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as {
          type: string;
          session?: string;
          filename?: string;
        };
        if (msg.type === "new-entry" && msg.session && msg.filename) {
          void loadSessions();
          if (selectedSessions.includes(msg.session)) {
            setTotalUnfiltered((n) => n + 1);
            void fetchEntries(msg.session, searchTerm || undefined).then((fresh) => {
              setEntries((prev) => {
                const others = prev.filter((en) => en.sessionName !== msg.session);
                return [...others, ...fresh].sort((a, b) =>
                  a.timestamp.localeCompare(b.timestamp)
                );
              });
            });
          }
        } else if (msg.type === "new-session") {
          void loadSessions();
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [selectedSessions, searchTerm, loadSessions]);

  // ── Select entry → load full data ───────────────────────────────────────────
  const handleSelect = useCallback(async (summary: EntrySummary) => {
    const key = `${summary.sessionName}-${summary.filename}`;
    setSelectedKey(key);
    setSelectedSummary(summary);
    setEntry(null);
    try {
      const full = await fetchEntry(summary.sessionName, summary.filename);
      setEntry(full);
    } catch {
      // ignore
    }
  }, []);

  // ── Resizable split pane ────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(15, pct)));
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setSelectedKey(null);
    setSelectedSummary(null);
    setEntry(null);
  }, []);

  const themeTitle =
    theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <SessionSelector
          sessions={sessions}
          selected={selectedSessions}
          onChange={setSelectedSessions}
        />
        <SearchBar
          total={searchTerm ? totalUnfiltered : entries.length}
          filtered={entries.length}
          onSearch={handleSearch}
        />
        <div className="flex-1" />
        <button
          onClick={cycle}
          title={themeTitle}
          className="p-1 rounded cursor-pointer transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        >
          <ThemeIcon theme={theme} />
        </button>
      </header>

      {/* Body */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left pane */}
        <div
          className="flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700"
          style={{ width: `${leftWidth}%` }}
        >
          <EntryTable
            entries={entries}
            selectedKey={selectedKey}
            onSelect={(summary) => void handleSelect(summary)}
            multiSession={selectedSessions.length > 1}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
        />

        {/* Right pane */}
        <div className="flex flex-1 overflow-hidden">
          <DetailView
            entry={entry}
            summary={selectedSummary}
            wordWrap={wordWrap}
            onToggleWrap={() => setWordWrap((w) => !w)}
            outputDir={outputDir}
          />
        </div>
      </div>
    </div>
  );
}
