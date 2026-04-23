import { Highlight, themes } from "prism-react-renderer";
import CopyBtn from "./CopyBtn";
import JsonBlock from "./JsonBlock";
import { detectLanguage } from "../lib/detectLanguage";
import { useIsDark } from "../hooks/useIsDark";

interface Props {
  data: unknown;
  wordWrap: boolean;
  /** undefined → internal modal + keys clickable; null → keys not clickable; fn → callback + keys clickable */
  onKeyClick?: ((title: string, value: unknown) => void) | null;
  showCopyBtn?: boolean;
}

export default function BodyView({ data, wordWrap, onKeyClick, showCopyBtn = true }: Props) {
  const isDark = useIsDark();

  // Compute copy text regardless of content type
  let copyText: string;
  if (typeof data === "string") {
    copyText = data;
    if (detectLanguage(data) === "json") {
      try { copyText = JSON.stringify(JSON.parse(data), null, 2); } catch { /* keep raw */ }
    }
  } else {
    copyText = JSON.stringify(data, null, 2);
  }

  // Non-string data: always render as JSON tree
  if (typeof data !== "string") {
    return (
      <JsonBlock
        data={data}
        wordWrap={wordWrap}
        onKeyClick={onKeyClick}
        showCopyBtn={showCopyBtn}
      />
    );
  }

  const lang = detectLanguage(data);

  // JSON string: parse and render as collapsible tree
  if (lang === "json") {
    return (
      <JsonBlock
        data={data}
        wordWrap={wordWrap}
        onKeyClick={onKeyClick}
        showCopyBtn={showCopyBtn}
      />
    );
  }

  // markup / text: syntax-highlighted or plain pre
  const hlTheme = isDark ? themes.vsDark : themes.github;

  return (
    <div className="relative group">
      {showCopyBtn && (
        <div className="sticky top-0 flex justify-end pointer-events-none">
          <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyBtn text={copyText} className="m-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600" />
          </div>
        </div>
      )}
      <div className={showCopyBtn ? "-mt-[30px]" : ""}>
        {lang === "markup" ? (
          <Highlight theme={hlTheme} code={data} language="markup">
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={`${className} p-3 rounded overflow-auto text-sm ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
                style={style}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        ) : (
          <pre className={`p-3 rounded overflow-auto text-sm font-mono bg-[var(--c-bg)] text-gray-800 dark:text-gray-200 ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
            {data}
          </pre>
        )}
      </div>
    </div>
  );
}
