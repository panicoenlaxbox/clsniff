import { useEffect, useRef, useState } from "react";
import type { Session } from "../types";

interface Props {
  sessions: Session[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function SessionSelector({ sessions, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (sessions.length === 0) {
    return <span className="text-gray-400">No sessions</span>;
  }

  const toggleSession = (name: string) => {
    if (selected.includes(name)) {
      if (selected.length > 1) {
        onChange(selected.filter((s) => s !== name));
      }
    } else {
      onChange([...selected, name]);
    }
  };

  const displayLabel =
    selected.length === 1
      ? selected[0]
      : selected.length === 0
      ? "No session"
      : `${selected.length} sessions`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-50 cursor-pointer max-w-xs"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="text-gray-500 shrink-0"
        >
          <path d="M1.75 2.5a.25.25 0 0 0-.25.25v1.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-1.5a.25.25 0 0 0-.25-.25ZM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v1.5A1.75 1.75 0 0 1 14.25 6H1.75A1.75 1.75 0 0 1 0 4.25Zm1.75 5.75a.25.25 0 0 0-.25.25v1.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-1.5a.25.25 0 0 0-.25-.25Zm-1.75.25C0 7.784.784 7 1.75 7h12.5c.966 0 1.75.784 1.75 1.75v1.5A1.75 1.75 0 0 1 14.25 12H1.75A1.75 1.75 0 0 1 0 10.25Z" />
        </svg>
        <span className="truncate">{displayLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`text-gray-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          <div className="py-1 max-h-80 overflow-y-auto">
            {sessions.map((session) => {
              const isSelected = selected.includes(session.name);
              return (
                <label
                  key={session.name}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSession(session.name)}
                    className="accent-blue-600"
                  />
                  <span className="text-gray-700 truncate flex-1">
                    {session.name}
                  </span>
                  <span className="text-gray-400 whitespace-nowrap">
                    {session.entryCount} entries
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
