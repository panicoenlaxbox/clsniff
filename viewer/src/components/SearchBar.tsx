import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface Props {
  total: number;
  filtered: number;
  onSearch: (term: string) => void;
}

export default function SearchBar({ total, filtered, onSearch }: Props) {
  const [value, setValue] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(value), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, onSearch]);

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
          placeholder="Search entries..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-7 pr-3 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500 w-56
            bg-white text-gray-800 placeholder-gray-400
            dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500 dark:focus:border-blue-400"
        />
        {value && (
          <button
            onClick={() => setValue("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {hasFilter ? `${filtered} / ${total}` : `${total} entries`}
      </span>
    </div>
  );
}
