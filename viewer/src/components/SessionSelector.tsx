import { useEffect, useRef, useState } from "react";
import type { Session } from "../types";
import { List, ChevronDown } from "lucide-react";

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
    return <span className="text-gray-400 dark:text-gray-500">No sessions</span>;
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
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-50 cursor-pointer max-w-xs
          dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
      >
        <List size={13} className="text-gray-500 dark:text-gray-400 shrink-0" />
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          size={10}
          className={`text-gray-400 dark:text-gray-500 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20
          dark:bg-gray-800 dark:border-gray-700">
          <div className="py-1 max-h-80 overflow-y-auto">
            {sessions.map((session) => {
              const isSelected = selected.includes(session.name);
              return (
                <label
                  key={session.name}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer dark:hover:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSession(session.name)}
                    className="accent-blue-600"
                  />
                  <span className="text-gray-700 dark:text-gray-200 truncate flex-1">
                    {session.name}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">
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
