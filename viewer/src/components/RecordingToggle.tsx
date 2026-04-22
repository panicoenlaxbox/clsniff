import { Pause, Play } from "lucide-react";

interface Props {
  paused: boolean;
  onToggle: () => void;
}

export default function RecordingToggle({ paused, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={paused ? "Resume recording" : "Pause recording"}
      className="p-1 rounded cursor-pointer transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
    >
      {paused ? <Play size={16} /> : <Pause size={16} />}
    </button>
  );
}
