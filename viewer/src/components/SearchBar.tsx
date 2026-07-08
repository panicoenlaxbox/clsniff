import { useEffect, useRef, useState } from "react";
import { Search, X, Regex } from "lucide-react";

interface Props {
  total: number;
  filtered: number;
  onSearch: (term: string, regex: boolean) => void;
  onOpenResults?: () => void;
}

export default function SearchBar({ total, filtered, onSearch, onOpenResults }: Props) {
  const [value, setValue] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When regex mode is on, an incomplete/invalid pattern shouldn't hit the
  // server: flag it locally and skip the search until it compiles.
  const invalidRegex = (() => {
    if (!useRegex || !value) return false;
    try {
      new RegExp(value);
      return false;
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (invalidRegex) return;
    timer.current = setTimeout(() => onSearch(value, useRegex), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, useRegex, invalidRegex, onSearch]);

  const hasFilter = value.length > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          placeholder={useRegex ? "Search (regex)..." : "Search entries..."}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          title={invalidRegex ? "Invalid regular expression" : undefined}
          className={`pl-7 pr-16 py-1 border rounded focus:outline-none w-56
            bg-white text-gray-800 placeholder-gray-400
            dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500
            ${
              invalidRegex
                ? "border-red-400 focus:border-red-500 dark:border-red-500 dark:focus:border-red-400"
                : "border-gray-300 focus:border-blue-500 dark:border-gray-600 dark:focus:border-blue-400"
            }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              onClick={() => setValue("")}
              title="Clear search"
              className="text-gray-400 hover:text-gray-600 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => setUseRegex((r) => !r)}
            title="Use regular expression"
            aria-pressed={useRegex}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              useRegex
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
                : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            <Regex size={15} />
          </button>
        </div>
      </div>
      {hasFilter && filtered > 0 ? (
        <button
          onClick={onOpenResults}
          title="View matches"
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer underline decoration-dotted underline-offset-2"
        >
          {filtered} / {total}
        </button>
      ) : (
        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {hasFilter ? `${filtered} / ${total}` : `${total} entries`}
        </span>
      )}
    </div>
  );
}
