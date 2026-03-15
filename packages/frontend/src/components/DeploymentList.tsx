import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Trash2, Loader2 } from "lucide-react";
import { listDeployments, deleteDeployment, type Deployment } from "../lib/api";
import { getAllSessions, removeSession } from "../lib/sessions";
import { StatusBadge } from "./StatusBadge";
import { useState } from "react";

function repoName(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.slice(-2).join("/").replace(/\.git$/, "");
  } catch {
    return url;
  }
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const sessions = getAllSessions();
  const session = sessions.find((s) => s.id === deployment.id);

  async function handleStop(e: React.MouseEvent) {
    e.stopPropagation();
    if (!session) return;
    if (!confirm("Stop this deployment?")) return;
    setIsDeleting(true);
    try {
      await deleteDeployment(deployment.id, session.sessionToken);
      removeSession(deployment.id);
      window.location.reload();
    } catch {
      setIsDeleting(false);
    }
  }

  const isActive = ["queued", "cloning", "building", "deploying", "running"].includes(deployment.status);

  return (
    <div
      onClick={() => navigate(`/deployments/${deployment.id}`)}
      className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg hover:border-slate-600 hover:bg-slate-800/50 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <StatusBadge status={deployment.status} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            {repoName(deployment.repoUrl)}
          </p>
          <p className="text-xs text-slate-500 font-mono truncate">
            {deployment.id.slice(0, 8)}
            {deployment.createdAt && (
              <span className="ml-2">
                {new Date(deployment.createdAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        {deployment.portMappings.length > 0 && deployment.status === "running" && (
          <a
            href={deployment.portMappings[0].tunnelUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!deployment.portMappings[0].tunnelUrl) e.preventDefault(); e.stopPropagation(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 border border-blue-800/30 rounded transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            :{deployment.portMappings[0].containerPort}
          </a>
        )}
        {isActive && (
          <button
            onClick={handleStop}
            disabled={isDeleting}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function DeploymentList() {
  const sessions = getAllSessions();

  const { data, isLoading } = useQuery({
    queryKey: ["deployments", sessions.map((s) => s.id).join(",")],
    queryFn: () => listDeployments(sessions),
    enabled: sessions.length > 0,
    refetchInterval: 5000,
  });

  if (sessions.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
        </div>
      </div>
    );
  }

  const allDeployments = data?.deployments ?? [];
  if (allDeployments.length === 0) {
    return null;
  }

  // Sort: active first, then by creation date descending
  const sorted = [...allDeployments].sort((a, b) => {
    const activeStatuses = ["running", "deploying", "building", "cloning", "queued"];
    const aActive = activeStatuses.includes(a.status) ? 0 : 1;
    const bActive = activeStatuses.includes(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <h2 className="text-sm font-medium text-slate-400 mb-3">Your Deployments</h2>
      <div className="flex flex-col gap-2">
        {sorted.map((d) => (
          <DeploymentRow key={d.id} deployment={d} />
        ))}
      </div>
    </div>
  );
}
