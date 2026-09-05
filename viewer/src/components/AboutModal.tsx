import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { fetchInfo, revealInFileManager } from "../api";
import type { AppInfo } from "../types";

interface Props {
  onClose: () => void;
}

const REPO_URL = "https://github.com/panicoenlaxbox/clsniff";
const NPM_URL = "https://www.npmjs.com/package/clsniff";

interface RowProps {
  label: string;
  value: string | null;
  /** When set, the value becomes a button that reveals it in the file manager. */
  onOpen?: () => void;
  openTitle?: string;
}

function Row({ label, value, onOpen, openTitle }: RowProps) {
  return (
    <div className="flex gap-3 py-1.5 border-t border-gray-100 dark:border-gray-800">
      <dt className="w-36 shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="flex-1 min-w-0 font-mono text-xs leading-5 break-all text-gray-700 dark:text-gray-200">
        {value === null ? (
          <span className="font-sans text-gray-400 dark:text-gray-600">none</span>
        ) : onOpen ? (
          <button
            onClick={onOpen}
            title={openTitle}
            className="text-left break-all cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
          >
            {value}
          </button>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default function AboutModal({ onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reveal = (session?: string) => {
    setError(null);
    revealInFileManager(session).catch(() => setError("Could not open the file manager."));
  };

  const revealTitle =
    info?.platform === "win32"
      ? "Show in Explorer"
      : info?.platform === "darwin"
        ? "Reveal in Finder"
        : "Open in file manager";

  // While loading, every value shows an ellipsis rather than a wrong "none".
  const value = (v: string | null | undefined) => (info ? (v ?? null) : "…");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col w-[30rem] max-w-[92vw]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-medium text-gray-700 dark:text-gray-200">About</span>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="p-4 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-semibold text-gray-800 dark:text-gray-100">
              clsniff
            </span>
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {info ? `v${info.version}` : "…"}
            </span>
          </div>
          <dl className="mt-4">
            <Row
              label="Output directory"
              value={value(info?.outputDir)}
              onOpen={info ? () => reveal() : undefined}
              openTitle={revealTitle}
            />
            <Row
              label="Active session"
              value={value(info?.activeSession)}
              onOpen={
                info?.activeSession ? () => reveal(info.activeSession ?? undefined) : undefined
              }
              openTitle={revealTitle}
            />
          </dl>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-4 flex items-center gap-4">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              GitHub <ExternalLink size={12} />
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              npm <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
