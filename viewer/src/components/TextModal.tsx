import { useEffect, useState } from "react";
import { WrapText, X } from "lucide-react";
import CopyBtn from "./CopyBtn";
import BodyView from "./BodyView";
import { detectLanguage } from "../lib/detectLanguage";

interface Props {
  title: string;
  content: string;
  onClose: () => void;
}

export default function TextModal({ title, content, onClose }: Props) {
  const [wrap, setWrap] = useState(true);

  const lang = detectLanguage(content);
  let copyContent = content;
  if (lang === "json") {
    try {
      copyContent = JSON.stringify(JSON.parse(content), null, 2);
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
            <CopyBtn text={copyContent} />
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
          <BodyView
            data={content}
            wordWrap={wrap}
            onKeyClick={null}
            showCopyBtn={false}
          />
        </div>
      </div>
    </div>
  );
}
