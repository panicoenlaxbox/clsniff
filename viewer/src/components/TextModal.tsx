import { useEffect, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import CopyBtn from "./CopyBtn";

interface Props {
  title: string;
  content: string;
  onClose: () => void;
}

function detectLanguage(text: string): "json" | "markup" | "text" {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "markup";
  return "text";
}

export default function TextModal({ title, content, onClose }: Props) {
  const [wrap, setWrap] = useState(true);
  const lang = detectLanguage(content);

  let displayContent = content;
  if (lang === "json") {
    try {
      displayContent = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // keep as-is
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-2xl flex flex-col w-[92vw] h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
          <span className="font-medium text-gray-700">{title}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWrap((w) => !w)}
              title={wrap ? "Disable word wrap" : "Enable word wrap"}
              className={`p-1 rounded cursor-pointer transition-colors ${
                wrap
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 3.5A.5.5 0 0 1 1.5 3h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 3.5zM1 7.5A.5.5 0 0 1 1.5 7H10a3 3 0 0 1 0 6H8.5a.5.5 0 0 1 0-1H10a2 2 0 0 0 0-4H1.5A.5.5 0 0 1 1 7.5zm9.854 2.646a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708-.708l1.146-1.146-1.146-1.146a.5.5 0 0 1 .708-.708l1.5 1.5zM1 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
              </svg>
            </button>
            <CopyBtn text={displayContent} />
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-4 font-mono">
          {lang === "text" ? (
            <pre
              className={`text-gray-800 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
            >
              {displayContent}
            </pre>
          ) : (
            <Highlight theme={themes.github} code={displayContent} language={lang}>
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre
                  className={`${className} ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
                  style={style}
                >
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, k) => (
                        <span key={k} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          )}
        </div>
      </div>
    </div>
  );
}
