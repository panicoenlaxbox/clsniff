import { useState } from "react";
import type { Entry, EntrySummary } from "../types";
import HeadersSection from "./HeadersSection";
import JsonBlock from "./JsonBlock";

interface Props {
  entry: Entry | null;
  summary: EntrySummary | null;
  wordWrap: boolean;
  onToggleWrap: () => void;
}

type Tab = "request" | "response";

function statusColor(status: number): string {
  if (status >= 500) return "text-red-600";
  if (status >= 400) return "text-orange-500";
  if (status >= 300) return "text-blue-600";
  return "text-green-600";
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
    <div className="border border-gray-200 rounded">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 hover:bg-gray-100 cursor-pointer rounded-t"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
        </svg>
        Body
      </button>
      {open && (
        <div className="p-2">
          {body === null || body === undefined ? (
            <span className="font-mono text-gray-400 px-3 py-2 block">null</span>
          ) : (
            <JsonBlock data={body} wordWrap={wordWrap} />
          )}
        </div>
      )}
    </div>
  );
}

export default function DetailView({ entry, summary, wordWrap, onToggleWrap }: Props) {
  const [tab, setTab] = useState<Tab>("request");
  const [headersOpen, setHeadersOpen] = useState(true);
  const [bodyOpen, setBodyOpen] = useState(true);

  if (!entry || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Select an entry to inspect
      </div>
    );
  }

  const isRequest = tab === "request";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 bg-white shrink-0 px-2 gap-1">
        {(["request", "response"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 font-medium capitalize cursor-pointer transition-colors border-b-2 -mb-px
              ${tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-gray-400">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400 mr-1">
          {entry.duration_ms.toFixed(0)} ms
        </span>
        {/* Download */}
        <a
          href={`/api/sessions/${encodeURIComponent(summary.sessionName)}/entries/${encodeURIComponent(summary.filename)}?download=true`}
          download={summary.filename}
          title="Download JSON file"
          className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/>
            <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.779a.749.749 0 1 1 1.06-1.06l1.97 1.97Z"/>
          </svg>
        </a>
        {/* Word wrap toggle */}
        <button
          onClick={onToggleWrap}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          className={`p-1 rounded cursor-pointer transition-colors ${
            wordWrap
              ? "text-blue-600 bg-blue-50"
              : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A.5.5 0 0 1 1.5 3h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 3.5zM1 7.5A.5.5 0 0 1 1.5 7H10a3 3 0 0 1 0 6H8.5a.5.5 0 0 1 0-1H10a2 2 0 0 0 0-4H1.5A.5.5 0 0 1 1 7.5zm9.854 2.646a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708-.708l1.146-1.146-1.146-1.146a.5.5 0 0 1 .708-.708l1.5 1.5zM1 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isRequest ? (
          <>
            {/* Request metadata bar */}
            <div className="font-mono text-gray-600 bg-gray-50 rounded px-3 py-2 break-all">
              <span className="text-gray-800 mr-2">
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
            {/* Response status bar */}
            <div className="font-mono text-gray-600 bg-gray-50 rounded px-3 py-2">
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
    </div>
  );
}
