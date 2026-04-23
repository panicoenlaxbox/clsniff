import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import CopyBtn from "./CopyBtn";
import TextModal from "./TextModal";

interface Props {
  data: unknown;
  wordWrap: boolean;
  /** undefined → internal modal + keys clickable; null → keys not clickable; fn → callback + keys clickable */
  onKeyClick?: ((title: string, value: unknown) => void) | null;
  showCopyBtn?: boolean;
}

const C = {
  key:     "var(--c-key)",
  string:  "var(--c-string)",
  number:  "var(--c-number)",
  keyword: "var(--c-keyword)",
  punct:   "var(--c-punct)",
};

const INDENT = 16;

function serializeForModal(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function hasChildren(val: unknown): boolean {
  if (val === null || typeof val !== "object") return false;
  if (Array.isArray(val)) return (val as unknown[]).length > 0;
  return Object.keys(val as object).length > 0;
}

interface NodeProps {
  value: unknown;
  path: string;
  depth: number;
  isLast: boolean;
  collapsed: Set<string>;
  toggle: (path: string) => void;
  onKeyClick: ((title: string, value: unknown) => void) | null;
}

function CollapseBtn({ path, isCollapsed, toggle }: {
  path: string;
  isCollapsed: boolean;
  toggle: (path: string) => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(path); }}
      className="inline-flex items-center justify-center shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer align-middle"
      style={{ width: INDENT, height: INDENT, color: C.punct }}
      aria-label={isCollapsed ? "Expand" : "Collapse"}
    >
      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
    </button>
  );
}

function Spacer() {
  return <span className="inline-block shrink-0 align-middle" style={{ width: INDENT }} />;
}

function JsonNode({ value, path, depth, isLast, collapsed, toggle, onKeyClick }: NodeProps): React.ReactNode {
  const comma = !isLast ? <span style={{ color: C.punct }}>,</span> : null;
  const isCollapsed = collapsed.has(path);
  const keyClickable = onKeyClick !== null;

  if (value === null) {
    return <><span style={{ color: C.keyword }}>null</span>{comma}</>;
  }
  if (typeof value === "boolean") {
    return <><span style={{ color: C.keyword }}>{String(value)}</span>{comma}</>;
  }
  if (typeof value === "number") {
    return <><span style={{ color: C.number }}>{String(value)}</span>{comma}</>;
  }
  if (typeof value === "string") {
    return (
      <>
        <span style={{ color: C.string }}>&quot;{value}&quot;</span>
        {comma}
      </>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <><span style={{ color: C.punct }}>[]</span>{comma}</>;
    }
    return (
      <>
        <span
          style={{ color: C.punct }}
          className="select-none"
          onDoubleClick={(e) => { e.preventDefault(); toggle(path); }}
        >
          {"["}
        </span>
        {isCollapsed ? (
          <>
            <span style={{ color: C.punct }} className="opacity-50"> … </span>
            <span style={{ color: C.punct }}>]</span>
            {comma}
          </>
        ) : (
          <>
            {(value as unknown[]).map((item, i) => {
              const childPath = `${path}[${i}]`;
              const childHasChildren = hasChildren(item);
              return (
                <div key={i} style={{ paddingLeft: INDENT }}>
                  {childHasChildren
                    ? <CollapseBtn path={childPath} isCollapsed={collapsed.has(childPath)} toggle={toggle} />
                    : <Spacer />
                  }
                  <JsonNode
                    value={item}
                    path={childPath}
                    depth={depth + 1}
                    isLast={i === value.length - 1}
                    collapsed={collapsed}
                    toggle={toggle}
                    onKeyClick={onKeyClick}
                  />
                </div>
              );
            })}
            <div style={{ paddingLeft: 0 }}>
              <Spacer />
              <span
                style={{ color: C.punct }}
                className="select-none"
                onDoubleClick={(e) => { e.preventDefault(); toggle(path); }}
              >
                {"]"}
              </span>
              {comma}
            </div>
          </>
        )}
      </>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <><span style={{ color: C.punct }}>{"{}"}</span>{comma}</>;
    }
    return (
      <>
        <span
          style={{ color: C.punct }}
          className="select-none"
          onDoubleClick={(e) => { e.preventDefault(); toggle(path); }}
        >
          {"{"}
        </span>
        {isCollapsed ? (
          <>
            <span style={{ color: C.punct }} className="opacity-50"> … </span>
            <span style={{ color: C.punct }}>{"}"}</span>
            {comma}
          </>
        ) : (
          <>
            {entries.map(([key, val], i) => {
              const childPath = `${path}.${key}`;
              const childHasChildren = hasChildren(val);
              return (
                <div key={key} style={{ paddingLeft: INDENT }}>
                  {childHasChildren
                    ? <CollapseBtn path={childPath} isCollapsed={collapsed.has(childPath)} toggle={toggle} />
                    : <Spacer />
                  }
                  <span
                    style={{
                      color: C.key,
                      cursor: keyClickable ? "pointer" : "default",
                    }}
                    className={keyClickable ? "hover:underline decoration-dotted hover:bg-blue-50 dark:hover:bg-blue-950 rounded" : ""}
                    onClick={keyClickable ? () => onKeyClick(key, val) : undefined}
                    title={keyClickable ? "Click to expand" : undefined}
                  >
                    &quot;{key}&quot;
                  </span>
                  <span style={{ color: C.punct }}>: </span>
                  <JsonNode
                    value={val}
                    path={childPath}
                    depth={depth + 1}
                    isLast={i === entries.length - 1}
                    collapsed={collapsed}
                    toggle={toggle}
                    onKeyClick={onKeyClick}
                  />
                </div>
              );
            })}
            <div style={{ paddingLeft: 0 }}>
              <Spacer />
              <span
                style={{ color: C.punct }}
                className="select-none"
                onDoubleClick={(e) => { e.preventDefault(); toggle(path); }}
              >
                {"}"}
              </span>
              {comma}
            </div>
          </>
        )}
      </>
    );
  }

  return <>{String(value)}</>;
}

export default function JsonBlock({ data, wordWrap, onKeyClick, showCopyBtn = true }: Props) {
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      // keep as raw string
    }
  }

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const effectiveKeyClick: ((title: string, value: unknown) => void) | null =
    onKeyClick === null
      ? null
      : (onKeyClick ?? ((title, value) => setModal({ title, content: serializeForModal(value) })));

  const copyText =
    typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

  const rootHasChildren = hasChildren(parsed);

  return (
    <div className="relative group">
      {showCopyBtn && (
        <div className="sticky top-0 flex justify-end pointer-events-none">
          <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyBtn text={copyText} className="m-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600" />
          </div>
        </div>
      )}

      <div
        className={`p-3 rounded overflow-auto bg-[var(--c-bg)] font-mono text-sm leading-relaxed ${
          wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
        } ${showCopyBtn ? "-mt-[30px]" : ""}`}
        style={{ color: C.punct }}
      >
        {rootHasChildren
          ? <CollapseBtn path="$" isCollapsed={collapsed.has("$")} toggle={toggle} />
          : <Spacer />
        }
        <JsonNode
          value={parsed}
          path="$"
          depth={0}
          isLast={true}
          collapsed={collapsed}
          toggle={toggle}
          onKeyClick={effectiveKeyClick}
        />
      </div>

      {onKeyClick === undefined && modal && (
        <TextModal
          title={modal.title}
          content={modal.content}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
