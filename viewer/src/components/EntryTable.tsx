import { useState, useMemo, useRef, useCallback } from "react";
import type { EntrySummary } from "../types";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  entries: EntrySummary[];
  selectedKey: string | null;
  onSelect: (entry: EntrySummary) => void;
  multiSession: boolean;
}

type SortKey = "timestamp" | "method" | "status" | "host" | "path" | "session";
type SortDir = "asc" | "desc";

interface ColWidths {
  session: number;
  timestamp: number;
  method: number;
  status: number;
  host: number;
}

const DEFAULT_WIDTHS: ColWidths = {
  session: 140,
  timestamp: 100,
  method: 72,
  status: 62,
  host: 160,
};

function statusColor(status: number): string {
  if (status >= 500) return "text-red-600 dark:text-red-400";
  if (status >= 400) return "text-orange-500 dark:text-orange-400";
  if (status >= 300) return "text-blue-600 dark:text-blue-400";
  return "text-green-600 dark:text-green-400";
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString("en-US", { hour12: false }) +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    );
  } catch {
    return ts;
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={10} className="text-gray-300 dark:text-gray-600 ml-0.5 shrink-0" />;
  return dir === "asc"
    ? <ChevronDown size={10} className="text-blue-500 dark:text-blue-400 ml-0.5 shrink-0" />
    : <ChevronUp size={10} className="text-blue-500 dark:text-blue-400 ml-0.5 shrink-0" />;
}

export default function EntryTable({ entries, selectedKey, onSelect, multiSession }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [widths, setWidths] = useState<ColWidths>(DEFAULT_WIDTHS);

  const resizingCol = useRef<keyof ColWidths | null>(null);
  const resizingStartX = useRef(0);
  const resizingStartW = useRef(0);

  const startResize = useCallback((col: keyof ColWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = col;
    resizingStartX.current = e.clientX;
    resizingStartW.current = widths[col];

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = ev.clientX - resizingStartX.current;
      const newW = Math.max(40, resizingStartW.current + delta);
      setWidths((prev) => ({ ...prev, [resizingCol.current!]: newW }));
    };
    const onUp = () => {
      resizingCol.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "timestamp": cmp = a.timestamp.localeCompare(b.timestamp); break;
        case "method":    cmp = a.method.localeCompare(b.method); break;
        case "status":    cmp = a.status - b.status; break;
        case "host":      cmp = hostFromUrl(a.url).localeCompare(hostFromUrl(b.url)); break;
        case "path":      cmp = pathFromUrl(a.url).localeCompare(pathFromUrl(b.url)); break;
        case "session":   cmp = a.sessionName.localeCompare(b.sessionName); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        No entries
      </div>
    );
  }

  const col = (label: string, key: SortKey, colKey: keyof ColWidths) => (
    <th
      style={{ width: widths[colKey], minWidth: widths[colKey] }}
      className="relative text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-200 dark:border-gray-700 select-none group/th"
    >
      <span
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-0.5 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </span>
      <div
        onMouseDown={(e) => startResize(colKey, e)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center opacity-0 group-hover/th:opacity-100 hover:!opacity-100"
      >
        <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
      </div>
    </th>
  );

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse table-fixed">
        <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 z-10">
          <tr>
            {multiSession && col("Session", "session", "session")}
            {col("Time", "timestamp", "timestamp")}
            {col("Method", "method", "method")}
            {col("Status", "status", "status")}
            {col("Host", "host", "host")}
            <th
              onClick={() => handleSort("path")}
              className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-200 dark:border-gray-700 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 w-full"
            >
              <span className="inline-flex items-center gap-0.5">
                Path
                <SortIcon active={sortKey === "path"} dir={sortDir} />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => {
            const key = `${entry.sessionName}-${entry.filename}`;
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                onClick={() => onSelect(entry)}
                className={`cursor-pointer border-b border-gray-100 dark:border-gray-700/50 transition-colors
                  ${selected
                    ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
              >
                {multiSession && (
                  <td className="px-2 py-1 whitespace-nowrap text-gray-400 dark:text-gray-500 truncate overflow-hidden" title={entry.sessionName}>
                    {entry.sessionName}
                  </td>
                )}
                <td className="px-2 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400 overflow-hidden">
                  {formatTime(entry.timestamp)}
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-gray-700 dark:text-gray-300 overflow-hidden">
                  {entry.method}
                </td>
                <td className={`px-2 py-1 whitespace-nowrap overflow-hidden ${statusColor(entry.status)}`}>
                  {entry.status}
                </td>
                <td className="px-2 py-1 text-gray-500 dark:text-gray-400 truncate overflow-hidden" title={hostFromUrl(entry.url)}>
                  {hostFromUrl(entry.url)}
                </td>
                <td className="px-2 py-1 text-gray-700 dark:text-gray-300 truncate overflow-hidden" title={entry.url}>
                  {pathFromUrl(entry.url)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
