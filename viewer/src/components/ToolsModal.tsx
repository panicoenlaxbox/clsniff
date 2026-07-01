import { useEffect, useState } from "react";
import { WrapText, X } from "lucide-react";
import CopyBtn from "./CopyBtn";
import JsonBlock from "./JsonBlock";

interface Tool {
  name: string;
  description?: string;
  input_schema?: unknown;
}

interface Props {
  tools: Tool[];
  onClose: () => void;
  wordWrap?: boolean;
}

export default function ToolsModal({ tools, onClose, wordWrap = false }: Props) {
  const [selected, setSelected] = useState(0);
  const [wrap, setWrap] = useState(wordWrap);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = tools[selected];
  const copyText = current ? JSON.stringify(current, null, 2) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col w-[92vw] h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-medium text-gray-700 dark:text-gray-200">
            Tools <span className="text-gray-400 dark:text-gray-500 font-normal">({tools.length})</span>
          </span>
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
            <CopyBtn text={copyText} />
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Body: index sidebar + detail */}
        <div className="flex-1 flex overflow-hidden">
          {/* Index */}
          <div className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700 py-1">
            {tools.map((tool, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`w-full text-left px-3 py-1.5 font-mono text-sm truncate cursor-pointer transition-colors ${
                  i === selected
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
                title={tool.name}
              >
                {tool.name}
              </button>
            ))}
          </div>
          {/* Detail */}
          <div className="flex-1 overflow-auto p-4 font-mono">
            {current ? (
              <JsonBlock data={current} wordWrap={wrap} onKeyClick={null} showCopyBtn={false} />
            ) : (
              <div className="text-gray-400 dark:text-gray-500">No tool selected.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
