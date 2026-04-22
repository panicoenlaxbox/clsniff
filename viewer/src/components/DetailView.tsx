import { useState, useEffect, useRef } from "react";
import type { Entry, EntrySummary } from "../types";
import { ChevronRight, Download, WrapText, Info } from "lucide-react";
import HeadersSection from "./HeadersSection";
import JsonBlock from "./JsonBlock";
import ClaudeView from "./ClaudeView";
import CopyBtn from "./CopyBtn";
import { isClaudeEntry } from "../lib/claude";

interface Props {
  entry: Entry | null;
  summary: EntrySummary | null;
  wordWrap: boolean;
  onToggleWrap: () => void;
  outputDir: string;
}

type Tab = "request" | "response" | "claude";

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

function BodySection({
  body,
  wordWrap,
  open,
  onToggle,
}: {
  body: unknown;
  wordWrap: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-t"
      >
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        Body
      </button>
      {open && (
        <div className="p-2">
          {body === null || body === undefined ? (
            <span className="font-mono text-gray-400 dark:text-gray-500 px-3 py-2 block">null</span>
          ) : (
            <JsonBlock data={body} wordWrap={wordWrap} />
          )}
        </div>
      )}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 group">
      <span className="text-gray-400 dark:text-gray-500 uppercase tracking-wider shrink-0 w-20 pt-0.5">
        {label}
      </span>
      <span className="text-gray-700 dark:text-gray-200 flex-1 break-all">
        {value}
      </span>
      <div className="opacity-0 group-hover:opacity-100 shrink-0 -my-0.5">
        <CopyBtn text={value} />
      </div>
    </div>
  );
}

export default function DetailView({ entry, summary, wordWrap, onToggleWrap, outputDir }: Props) {
  const [tab, setTab] = useState<Tab>("request");
  const [headersOpen, setHeadersOpen] = useState(true);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(false);
  const propsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!propsOpen) return;
    const handler = (e: MouseEvent) => {
      if (propsRef.current && !propsRef.current.contains(e.target as Node)) {
        setPropsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [propsOpen]);

  useEffect(() => {
    if (tab === "claude" && entry !== null && !isClaudeEntry(entry)) {
      setTab("request");
    }
  }, [entry, tab]);

  if (!entry || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        Select an entry to inspect
      </div>
    );
  }

  const tabs: Tab[] = isClaudeEntry(entry)
    ? ["request", "response", "claude"]
    : ["request", "response"];

  const tabLabels: Record<Tab, string> = { request: "Request", response: "Response", claude: "Claude" };

  const sep = outputDir.includes("\\") ? "\\" : "/";
  const filePath = outputDir
    ? [outputDir, summary.sessionName, summary.filename].join(sep)
    : summary.filename;

  const statusText = entry.response.status_reason
    ? `${entry.response.status} ${entry.response.status_reason}`
    : String(entry.response.status);

  const iconBtn = (active: boolean) =>
    `p-1 rounded cursor-pointer transition-colors ${
      active
        ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0 px-2 gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 font-medium cursor-pointer transition-colors border-b-2 -mb-px
              ${tab === t
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
          >
            {tabLabels[t]}
          </button>
        ))}
        <div className="flex-1" />
        {/* Download */}
        <a
          href={`/api/sessions/${encodeURIComponent(summary.sessionName)}/entries/${encodeURIComponent(summary.filename)}?download=true`}
          download={summary.filename}
          title="Download JSON file"
          className={iconBtn(false)}
        >
          <Download size={16} />
        </a>
        {/* Word wrap toggle */}
        {/* Word wrap toggle */}
        <button
          onClick={onToggleWrap}
          disabled={tab === "claude"}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          className={`${iconBtn(wordWrap)} disabled:opacity-30 disabled:cursor-default`}
        >
          <WrapText size={16} />
        </button>
        {/* Entry properties */}
        <div className="relative" ref={propsRef}>
          <button onClick={() => setPropsOpen((o) => !o)} title="Entry properties" className={iconBtn(propsOpen)}>
            <Info size={16} />
          </button>
          {propsOpen && (
            <div className="absolute top-full right-0 mt-1 w-96 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
              <div className="py-1.5">
                <PropRow label="Timestamp" value={formatTimestamp(entry.timestamp)} />
                <PropRow label="Duration" value={`${entry.duration_ms.toFixed(0)} ms`} />
                <PropRow label="Session" value={summary.sessionName} />
                <PropRow label="Method" value={entry.request.method} />
                <PropRow label="URL" value={entry.request.url} />
                <PropRow label="Status" value={statusText} />
                <PropRow label="File" value={filePath} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === "claude" ? (
        <ClaudeView entry={entry} wordWrap={wordWrap} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white dark:bg-gray-900">
          {tab === "request" ? (
            <>
              <div className="font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 break-all">
                <span className="text-gray-800 dark:text-gray-100 mr-2">
                  {entry.request.method}
                </span>
                {entry.request.url}
              </div>
              <HeadersSection
                headers={entry.request.headers}
                wordWrap={wordWrap}
                open={headersOpen}
                onToggle={() => setHeadersOpen((o) => !o)}
              />
              <BodySection
                body={entry.request.body}
                wordWrap={wordWrap}
                open={bodyOpen}
                onToggle={() => setBodyOpen((o) => !o)}
              />
            </>
          ) : (
            <>
              <div className="font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
                <span className={`mr-2 ${statusColor(entry.response.status)}`}>
                  {entry.response.status}
                </span>
                {entry.response.status_reason}
              </div>
              <HeadersSection
                headers={entry.response.headers}
                wordWrap={wordWrap}
                open={headersOpen}
                onToggle={() => setHeadersOpen((o) => !o)}
              />
              <BodySection
                body={entry.response.body}
                wordWrap={wordWrap}
                open={bodyOpen}
                onToggle={() => setBodyOpen((o) => !o)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
