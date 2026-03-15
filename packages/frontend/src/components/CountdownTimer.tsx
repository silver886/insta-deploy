import { useState, useEffect } from "react";
import { Clock, Plus, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { extendDeployment } from "../lib/api";

interface CountdownTimerProps {
  expiresAt: string | null;
  extensionCount: number;
  deploymentId: string;
  sessionToken: string;
  onExtended?: () => void;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Expired";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function CountdownTimer({
  expiresAt,
  extensionCount,
  deploymentId,
  sessionToken,
  onExtended,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isExtending, setIsExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    function update() {
      const remaining = new Date(expiresAt!).getTime() - Date.now();
      setTimeRemaining(Math.max(0, remaining));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleExtend() {
    setIsExtending(true);
    setExtendError(null);
    try {
      await extendDeployment(deploymentId, sessionToken);
      onExtended?.();
    } catch (err) {
      setExtendError(err instanceof Error ? err.message : "Failed to extend");
    } finally {
      setIsExtending(false);
    }
  }

  if (!expiresAt) return null;

  const isWarning = timeRemaining > 0 && timeRemaining < 5 * 60 * 1000;
  const isExpired = timeRemaining <= 0;
  const canExtend = extensionCount < 2;

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Time Remaining
      </h3>
      <div
        className={clsx(
          "text-2xl font-mono font-bold mb-3",
          isExpired && "text-slate-500",
          isWarning && "text-red-400",
          !isExpired && !isWarning && "text-slate-200",
        )}
      >
        {formatTimeRemaining(timeRemaining)}
      </div>
      {canExtend && !isExpired && (
        <button
          onClick={handleExtend}
          disabled={isExtending}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 border border-blue-600/40 text-blue-300 rounded-lg text-sm hover:bg-blue-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
        >
          {isExtending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Extend Session
        </button>
      )}
      {extendError && (
        <p className="text-red-400 text-xs mt-2">{extendError}</p>
      )}
      {!canExtend && !isExpired && (
        <p className="text-slate-500 text-xs">Maximum extensions reached</p>
      )}
    </div>
  );
}
