import { Fragment, useState } from "react";
import CopyBtn from "./CopyBtn";
import TextModal from "./TextModal";

interface Props {
  data: unknown;
  wordWrap: boolean;
}

// GitHub-inspired colors (matches themes.github from prism-react-renderer)
const C = {
  key: "#0a3069",
  string: "#116329",
  number: "#0550ae",
  keyword: "#cf222e", // true, false, null
  punct: "#24292e",
};

function serializeForModal(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

interface NodeProps {
  value: unknown;
  depth: number;
  isLast: boolean;
  onClickKey: (title: string, value: unknown) => void;
}

function JsonNode({ value, depth, isLast, onClickKey }: NodeProps): React.ReactNode {
  const comma = !isLast ? <span style={{ color: C.punct }}>,</span> : null;
  const pad = (d: number) => "  ".repeat(d);

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
        <span style={{ color: C.string }}>
          &quot;{value}&quot;
        </span>
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
        <span style={{ color: C.punct }}>{"["}</span>{"\n"}
        {value.map((item, i) => (
          <Fragment key={i}>
            {pad(depth + 1)}
            <JsonNode
              value={item}
              depth={depth + 1}
              isLast={i === value.length - 1}
              onClickKey={onClickKey}
            />
            {"\n"}
          </Fragment>
        ))}
        {pad(depth)}<span style={{ color: C.punct }}>{"]"}</span>{comma}
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
        <span style={{ color: C.punct }}>{"{"}</span>{"\n"}
        {entries.map(([key, val], i) => (
          <Fragment key={key}>
            {pad(depth + 1)}
            <span
              style={{ color: C.key, cursor: "pointer" }}
              className="hover:underline decoration-dotted hover:bg-blue-50 rounded"
              onClick={() => onClickKey(key, val)}
              title="Click to expand"
            >
              &quot;{key}&quot;
            </span>
            <span style={{ color: C.punct }}>: </span>
            <JsonNode
              value={val}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              onClickKey={onClickKey}
            />
            {"\n"}
          </Fragment>
        ))}
        {pad(depth)}<span style={{ color: C.punct }}>{"}"}</span>{comma}
      </>
    );
  }

  return <>{String(value)}</>;
}

export default function JsonBlock({ data, wordWrap }: Props) {
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);

  // Try to parse string data as JSON
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      // keep as raw string
    }
  }

  const copyText =
    typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

  return (
    <div className="relative group">
      {/* Hover-reveal copy button */}
      <div className="sticky top-0 flex justify-end pointer-events-none">
        <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyBtn text={copyText} className="m-1 bg-white shadow-sm border border-gray-200" />
        </div>
      </div>

      <pre
        className={`p-3 rounded overflow-auto bg-[#f6f8fa] ${
          wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
        }`}
        style={{
          color: C.punct,
          marginTop: "-30px",
        }}
      >
        <JsonNode
          value={parsed}
          depth={0}
          isLast={true}
          onClickKey={(title, value) =>
            setModal({ title, content: serializeForModal(value) })
          }
        />
      </pre>

      {modal && (
        <TextModal
          title={modal.title}
          content={modal.content}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
