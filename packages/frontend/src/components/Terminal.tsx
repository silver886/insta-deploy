import { X, TerminalSquare, Loader2, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { startTerminalSession, type TerminalSession } from "../lib/api";

interface TerminalProps {
  deploymentId: string;
  sessionToken: string;
  onClose: () => void;
}

export function Terminal({ deploymentId, sessionToken, onClose }: TerminalProps) {
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const s = await startTerminalSession(deploymentId, sessionToken);
        if (!cancelled) {
          setSession(s);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start terminal");
          setLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [deploymentId, sessionToken]);

  const terminalUrl = session?.terminalUrl ?? null;

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          {terminalUrl && (
            <a
              href={terminalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="h-[400px]">
        {loading && (
          <div className="flex items-center justify-center h-full gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Starting terminal...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {terminalUrl && !loading && !error && (
          <iframe
            src={terminalUrl}
            className="block w-full h-full border-0 bg-black"
            title="Terminal"
          />
        )}
      </div>
    </div>
  );
}
