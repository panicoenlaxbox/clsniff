import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../types";
import { List, ChevronDown, ChevronRight, Pencil, Check, X, Search } from "lucide-react";

interface Props {
  sessions: Session[];
  selected: string[];
  /** Session currently being recorded, if any: it is pinned on top and cannot be renamed. */
  activeSession: string | null;
  onChange: (selected: string[]) => void;
  /** Resolves once the rename is done; rejects with the reason to show inline. */
  onRename: (from: string, to: string) => Promise<void>;
}

/** The two collapsible groups. The active session is always shown and never collapses. */
type Group = "named" | "generated";

const COLLAPSE_KEY = "sessionGroupsCollapsed";

function readCollapsed(): Record<Group, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return { named: false, generated: false, ...JSON.parse(raw) };
  } catch {
    // a malformed or unavailable store just means the default
  }
  return { named: false, generated: false };
}

export default function SessionSelector({
  sessions,
  selected,
  activeSession,
  onChange,
  onRename,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<Group, boolean>>(readCollapsed);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Name a rename just produced, so the row can be pointed out wherever it landed.
  const [justRenamed, setJustRenamed] = useState<string | null>(null);
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

  // Closing the dropdown discards any half-typed name, but keeps the filter.
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setError(null);
      setJustRenamed(null);
    }
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      // persisting the preference is best-effort
    }
  }, [collapsed]);

  // Naming a session moves it from the generated group to the named one, so the row
  // the user just edited can end up in a collapsed section. Open wherever it landed.
  useEffect(() => {
    if (!justRenamed) return;
    const moved = sessions.find((s) => s.name === justRenamed);
    if (!moved) return;
    setCollapsed((prev) => ({ ...prev, [moved.generated ? "generated" : "named"]: false }));
    const timer = setTimeout(() => setJustRenamed(null), 2500);
    return () => clearTimeout(timer);
  }, [justRenamed, sessions]);

  const { active, named, generated } = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const matches = (s: Session) => !term || s.name.toLowerCase().includes(term);
    return {
      active: sessions.find((s) => s.name === activeSession) ?? null,
      // The active session has its own block; it never repeats below.
      named: sessions.filter((s) => !s.generated && s.name !== activeSession && matches(s)),
      generated: sessions.filter((s) => s.generated && s.name !== activeSession && matches(s)),
    };
  }, [sessions, activeSession, filter]);

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

  const startEdit = (name: string) => {
    setEditing(name);
    setDraft(name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const submitEdit = async (from: string) => {
    const to = draft.trim();
    if (!to || to === from) {
      cancelEdit();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(from, to);
      setEditing(null);
      // A filter that no longer matches would hide the row the user just renamed.
      if (filter.trim() && !to.toLowerCase().includes(filter.trim().toLowerCase())) {
        setFilter("");
      }
      setJustRenamed(to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename the session");
    } finally {
      setSaving(false);
    }
  };

  const displayLabel =
    selected.length === 1
      ? selected[0]
      : selected.length === 0
      ? "No session"
      : `${selected.length} sessions`;

  const renderRow = (session: Session, isActive: boolean) => {
    if (editing === session.name) {
      return (
        <form
          key={session.name}
          onSubmit={(e) => {
            e.preventDefault();
            void submitEdit(session.name);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50"
        >
          <input
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="flex-1 min-w-0 px-2 py-0.5 border border-blue-400 rounded bg-white text-gray-700
              focus:outline-none focus:ring-1 focus:ring-blue-400
              dark:bg-gray-900 dark:border-blue-500 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={saving}
            title="Save name"
            className="p-1 rounded cursor-pointer text-green-600 hover:bg-green-50 disabled:opacity-40
              dark:text-green-400 dark:hover:bg-green-900/30"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            title="Cancel"
            className="p-1 rounded cursor-pointer text-gray-400 hover:bg-gray-100 disabled:opacity-40
              dark:hover:bg-gray-700"
          >
            <X size={14} />
          </button>
        </form>
      );
    }

    const highlighted = session.name === justRenamed;

    return (
      <div
        key={session.name}
        ref={(el) => {
          if (el && highlighted) el.scrollIntoView({ block: "nearest" });
        }}
        className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 ${
          highlighted ? "bg-blue-50 dark:bg-blue-900/30" : ""
        }`}
      >
        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(session.name)}
            onChange={() => toggleSession(session.name)}
            className="accent-blue-600"
          />
          <span className="text-gray-700 dark:text-gray-200 truncate">{session.name}</span>
        </label>
        <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {session.entryCount} entries
        </span>
        <span
          title={isActive ? "The session being recorded cannot be renamed" : "Rename session"}
        >
          <button
            onClick={() => startEdit(session.name)}
            disabled={isActive}
            className="p-1 rounded text-gray-400 opacity-0 transition-opacity group-hover:opacity-100
              enabled:cursor-pointer enabled:hover:text-gray-700 enabled:hover:bg-gray-200
              disabled:cursor-not-allowed disabled:opacity-30
              dark:text-gray-500 dark:enabled:hover:text-gray-200 dark:enabled:hover:bg-gray-600"
          >
            <Pencil size={12} />
          </button>
        </span>
      </div>
    );
  };

  const filtering = filter.trim() !== "";

  const renderGroup = (group: Group, label: string, items: Session[]) => {
    if (items.length === 0) return null;
    const isCollapsed = collapsed[group] && !filtering;
    return (
      <section>
        <button
          onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium uppercase tracking-wide cursor-pointer
            text-gray-500 border-t border-gray-100 hover:bg-gray-50
            dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700/50"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{label}</span>
          <span className="text-gray-400 dark:text-gray-500">({items.length})</span>
        </button>
        {!isCollapsed && items.map((s) => renderRow(s, false))}
      </section>
    );
  };

  const nothingMatches = filtering && named.length === 0 && generated.length === 0;

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
        <div className="absolute top-full left-0 mt-1 min-w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20
          dark:bg-gray-800 dark:border-gray-700">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <Search size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && filter) {
                  e.preventDefault();
                  e.stopPropagation();
                  setFilter("");
                }
              }}
              placeholder="Filter sessions"
              className="flex-1 min-w-0 px-1 py-0.5 bg-transparent text-gray-700 placeholder:text-gray-400
                focus:outline-none dark:text-gray-200 dark:placeholder:text-gray-500"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                title="Clear filter"
                className="p-0.5 rounded cursor-pointer text-gray-400 hover:text-gray-700 hover:bg-gray-100
                  dark:hover:text-gray-200 dark:hover:bg-gray-700"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* The recording session stays on top and out of the filter: it is the one
                the user is most likely to want, and hiding it would be surprising. */}
            {active && (
              <section>
                <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-500 border-t border-gray-100
                  dark:text-gray-400 dark:border-gray-700">
                  Active
                </div>
                {renderRow(active, true)}
              </section>
            )}
            {renderGroup("named", "Named", named)}
            {renderGroup("generated", "Automatic", generated)}
            {nothingMatches && (
              <p className="px-3 py-3 text-center text-gray-400 dark:text-gray-500">
                No sessions match "{filter.trim()}"
              </p>
            )}
          </div>

          {error && (
            <p className="px-3 py-1.5 border-t border-gray-100 text-xs text-red-600 dark:border-gray-700 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
