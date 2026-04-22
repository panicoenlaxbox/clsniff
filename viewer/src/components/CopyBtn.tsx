import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  text: string;
  className?: string;
}

export default function CopyBtn({ text, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy"}
      className={`
        p-1 rounded transition-colors cursor-pointer
        ${copied
          ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        }
        ${className}
      `}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}
