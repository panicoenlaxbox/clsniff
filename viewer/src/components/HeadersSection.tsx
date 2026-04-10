import JsonBlock from "./JsonBlock";

interface Props {
  headers: Record<string, string>;
  wordWrap: boolean;
  open: boolean;
  onToggle: () => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
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
          <JsonBlock data={headers} wordWrap={wordWrap} />
        </div>
      )}
    </div>
  );
}
