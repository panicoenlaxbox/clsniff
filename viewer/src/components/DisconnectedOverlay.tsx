import { WifiOff } from "lucide-react";

export default function DisconnectedOverlay() {
  return (
    <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
        <div className="flex items-center gap-3">
          <WifiOff size={24} className="text-red-500 shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Server disconnected</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              The clsniff process is no longer running.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
