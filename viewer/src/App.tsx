import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, EntrySummary, Session } from "./types";
import { fetchEntry, fetchEntries, fetchSessions, fetchLoggingStatus, setLoggingPaused } from "./api";
import { Sun, Moon, Monitor } from "lucide-react";
import SessionSelector from "./components/SessionSelector";
import SearchBar from "./components/SearchBar";
import EntryTable from "./components/EntryTable";
import DetailView from "./components/DetailView";
import RecordingToggle from "./components/RecordingToggle";
import DisconnectedOverlay from "./components/DisconnectedOverlay";
import { useTheme } from "./hooks/useTheme";
import type { Theme } from "./hooks/useTheme";

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") return <Sun size={16} />;
  if (theme === "dark") return <Moon size={16} />;
  return <Monitor size={16} />;
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
  const [loggingPaused, setLoggingPausedState] = useState(false);
  const [connected, setConnected] = useState(true);
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

  useEffect(() => {
    fetchLoggingStatus().then((s) => setLoggingPausedState(s.paused)).catch(() => {});
  }, []);

  const handleToggleLogging = useCallback(async () => {
    const next = !loggingPaused;
    setLoggingPausedState(next);
    try {
      await setLoggingPaused(next);
    } catch {
      setLoggingPausedState(!next);
    }
  }, [loggingPaused]);

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
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      if (es.readyState !== EventSource.OPEN) setConnected(false);
    };
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
      {!connected && <DisconnectedOverlay />}
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
        <RecordingToggle paused={loggingPaused} onToggle={() => void handleToggleLogging()} />
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
