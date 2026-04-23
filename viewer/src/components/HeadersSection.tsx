import BodyView from "./BodyView";
import { ChevronRight } from "lucide-react";

interface Props {
  headers: Record<string, string>;
  wordWrap: boolean;
  open: boolean;
  onToggle: () => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />;
}

export default function HeadersSection({ headers, wordWrap, open, onToggle }: Props) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded mb-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-t"
      >
        <ChevronIcon open={open} />
        <span>Headers</span>
        <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal normal-case text-xs">
          {Object.keys(headers).length}
        </span>
      </button>

      {open && (
        <div className="p-2">
          <BodyView data={headers} wordWrap={wordWrap} />
        </div>
      )}
    </div>
  );
}
