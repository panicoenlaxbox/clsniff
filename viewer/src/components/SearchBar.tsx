import { useEffect, useRef, useState } from "react";

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
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
        </svg>
        <input
          type="text"
          placeholder="Search entries..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-7 pr-3 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500 w-56"
        />
        {value && (
          <button
            onClick={() => setValue("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        )}
      </div>
      <span className="text-gray-500 whitespace-nowrap">
        {hasFilter ? `${filtered} / ${total}` : `${total} entries`}
      </span>
    </div>
  );
}
