import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronUp, ChevronDown, WrapText, X, SquareMousePointer } from "lucide-react";
import { VscVscode } from "react-icons/vsc";
import type { MatchEntry } from "../types";
import { fetchMatches } from "../api";

interface Props {
  sessions: string[];
  search: string;
  outputDir: string;
  onClose: () => void;
  onGoToDetail: (entry: MatchEntry) => void;
  wordWrap?: boolean;
}

const iconBtn =
  "p-1 rounded cursor-pointer transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 shrink-0";

function statusColor(status: number): string {
  if (status >= 500) return "text-red-600 dark:text-red-400";
  if (status >= 400) return "text-orange-500 dark:text-orange-400";
  if (status >= 300) return "text-blue-600 dark:text-blue-400";
  return "text-green-600 dark:text-green-400";
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function filePathFor(outputDir: string, sessionName: string, filename: string): string {
  const sep = outputDir.includes("\\") ? "\\" : "/";
  return outputDir ? [outputDir, sessionName, filename].join(sep) : filename;
}

// ── Per-entry result panel ──────────────────────────────────────────────────

function ResultPanel({
  entry,
  outputDir,
  wrap,
  open,
  onToggleOpen,
  baseIndex,
  activeIndex,
  registerRef,
  onGoToDetail,
}: {
  entry: MatchEntry;
  outputDir: string;
  wrap: boolean;
  open: boolean;
  onToggleOpen: () => void;
  baseIndex: number;
  activeIndex: number;
  registerRef: (globalIdx: number, el: HTMLElement | null) => void;
  onGoToDetail: (entry: MatchEntry) => void;
}) {
  const filePath = filePathFor(outputDir, entry.sessionName, entry.filename);
  const statusText = entry.status_reason
    ? `${entry.status} ${entry.status_reason}`
    : String(entry.status);
  const activeLocal = activeIndex - baseIndex;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleOpen}
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer text-left"
          >
            <ChevronRight
              size={13}
              className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span className="font-mono font-semibold text-gray-800 dark:text-gray-100 shrink-0">
              {entry.method}
            </span>
            <span className={`font-mono shrink-0 ${statusColor(entry.status)}`}>{statusText}</span>
            <span className="font-mono text-gray-600 dark:text-gray-300 truncate" title={entry.url}>
              {entry.url}
            </span>
            <span className="ml-auto shrink-0 text-gray-400 dark:text-gray-500 font-normal normal-case text-xs">
              {entry.hunks.length} {entry.hunks.length === 1 ? "match" : "matches"}
            </span>
          </button>
          <a
            href={`vscode://file/${filePath.replace(/\\/g, "/")}${
              entry.hunks[0] ? `:${entry.hunks[0].line}:${entry.hunks[0].column}` : ""
            }`}
            title="Open in VS Code at first match"
            className={iconBtn}
          >
            <VscVscode size={16} />
          </a>
          <button onClick={() => onGoToDetail(entry)} title="Go to detail" className={iconBtn}>
            <SquareMousePointer size={16} />
          </button>
        </div>
        {/* Secondary line — timestamp only */}
        <div className="mt-1 pl-[21px] text-xs text-gray-400 dark:text-gray-500">
          {formatTimestamp(entry.timestamp)}
        </div>
      </div>

      {/* Hunks */}
      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {entry.hunks.map((h, i) => {
            const isActive = i === activeLocal;
            return (
              <pre
                key={i}
                className={`text-sm font-mono px-3 py-2 text-gray-700 dark:text-gray-300 overflow-x-auto ${
                  isActive ? "bg-yellow-50 dark:bg-yellow-500/10" : ""
                } ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
              >
                {h.before}
                <mark
                  ref={(el) => registerRef(baseIndex + i, el)}
                  className={
                    isActive
                      ? "bg-orange-300 text-gray-900 rounded-sm ring-1 ring-orange-400 dark:bg-orange-500/60 dark:text-orange-50 dark:ring-orange-400/60"
                      : "bg-yellow-200 text-gray-900 rounded-sm dark:bg-yellow-500/40 dark:text-yellow-100"
                  }
                >
                  {h.match}
                </mark>
                {h.after}
              </pre>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function SearchResultsModal({
  sessions,
  search,
  outputDir,
  onClose,
  onGoToDetail,
  wordWrap = false,
}: Props) {
  const [wrap, setWrap] = useState(wordWrap);
  const [entries, setEntries] = useState<MatchEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(-1);
  const hunkRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(false);
    setActive(-1);
    setCollapsed(new Set());
    Promise.all(sessions.map((s) => fetchMatches(s, search)))
      .then((results) => {
        if (cancelled) return;
        const merged = results
          .flat()
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        setEntries(merged);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessions, search]);

  // Flat index of every occurrence, in render order, plus per-entry base offsets.
  const { flat, bases, total } = useMemo(() => {
    const flat: { entryIdx: number; key: string }[] = [];
    const bases: number[] = [];
    let n = 0;
    (entries ?? []).forEach((e, ei) => {
      bases[ei] = n;
      const key = `${e.sessionName}-${e.filename}`;
      for (let hi = 0; hi < e.hunks.length; hi++) flat.push({ entryIdx: ei, key });
      n += e.hunks.length;
    });
    return { flat, bases, total: n };
  }, [entries]);

  const registerRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) hunkRefs.current.set(idx, el);
    else hunkRefs.current.delete(idx);
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return;
      const next = active < 0 ? (delta > 0 ? 0 : total - 1) : (active + delta + total) % total;
      const key = flat[next]?.key;
      // Auto-expand the target entry if it was collapsed.
      if (key) {
        setCollapsed((c) => {
          if (!c.has(key)) return c;
          const n = new Set(c);
          n.delete(key);
          return n;
        });
      }
      setActive(next);
    },
    [active, total, flat]
  );

  // Scroll the active occurrence into view (re-runs after an auto-expand too).
  useEffect(() => {
    if (active < 0) return;
    hunkRefs.current.get(active)?.scrollIntoView({ block: "center", inline: "center" });
  }, [active, collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(e.shiftKey ? -1 : 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  const toggleEntry = useCallback((key: string) => {
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col w-[92vw] h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-medium text-gray-700 dark:text-gray-200">
            Search results{" "}
            <span className="text-gray-400 dark:text-gray-500 font-normal">
              &ldquo;{search}&rdquo;
              {entries && (
                <>
                  {" · "}
                  {entries.length} {entries.length === 1 ? "entry" : "entries"} · {total}{" "}
                  {total === 1 ? "match" : "matches"}
                </>
              )}
            </span>
          </span>
          <div className="flex items-center gap-2">
            {/* Occurrence navigation */}
            {entries && total > 0 && (
              <div className="flex items-center gap-1 mr-1">
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mr-0.5">
                  {active >= 0 ? active + 1 : 0} / {total}
                </span>
                <button onClick={() => go(-1)} title="Previous match (Shift+Enter)" className={iconBtn}>
                  <ChevronUp size={16} />
                </button>
                <button onClick={() => go(1)} title="Next match (Enter)" className={iconBtn}>
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
            <button
              onClick={() => setWrap((w) => !w)}
              title={wrap ? "Disable word wrap" : "Enable word wrap"}
              className={`p-1 rounded cursor-pointer transition-colors ${
                wrap
                  ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <WrapText size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white dark:bg-gray-900">
          {error ? (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              Failed to load search results.
            </div>
          ) : entries === null ? (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              Searching…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              No matches.
            </div>
          ) : (
            entries.map((entry, ei) => {
              const key = `${entry.sessionName}-${entry.filename}`;
              return (
                <ResultPanel
                  key={key}
                  entry={entry}
                  outputDir={outputDir}
                  wrap={wrap}
                  open={!collapsed.has(key)}
                  onToggleOpen={() => toggleEntry(key)}
                  baseIndex={bases[ei]}
                  activeIndex={active}
                  registerRef={registerRef}
                  onGoToDetail={onGoToDetail}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
