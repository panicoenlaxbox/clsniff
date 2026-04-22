import { useEffect, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { WrapText, X } from "lucide-react";
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

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export default function TextModal({ title, content, onClose }: Props) {
  const [wrap, setWrap] = useState(true);
  const isDark = useIsDark();
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

  const hlTheme = isDark ? themes.vsDark : themes.github;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col w-[92vw] h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-medium text-gray-700 dark:text-gray-200">{title}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWrap((w) => !w)}
              title={wrap ? "Disable word wrap" : "Enable word wrap"}
              className={`p-1 rounded cursor-pointer transition-colors ${
                wrap
                  ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <WrapText size={16} />
            </button>
            <CopyBtn text={displayContent} />
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-4 font-mono">
          {lang === "text" ? (
            <pre className={`text-gray-800 dark:text-gray-200 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
              {displayContent}
            </pre>
          ) : (
            <Highlight theme={hlTheme} code={displayContent} language={lang}>
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
