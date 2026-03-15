import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, TerminalSquare, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useDeployment } from "../hooks/useDeployment";
import { useLogStream } from "../hooks/useLogStream";
import { useDeploymentStore } from "../store/deployment.store";
import { deleteDeployment } from "../lib/api";
import { getSession, removeSession } from "../lib/sessions";
import { StatusBadge } from "../components/StatusBadge";
import { BuildProgress } from "../components/BuildProgress";
import { LogStream } from "../components/LogStream";
import { PortList } from "../components/PortList";
import { CountdownTimer } from "../components/CountdownTimer";
import { Terminal } from "../components/Terminal";

export function DeploymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const sessionToken = id ? getSession(id) ?? "" : "";
  const { data: deployment, isLoading, error } = useDeployment(id ?? "", sessionToken);
  const { isConnected: isLogConnected } = useLogStream(id ?? "", sessionToken);
  const { isTerminalOpen, toggleTerminal } = useDeploymentStore();

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Invalid deployment ID.</p>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-slate-400">No session token found for this deployment.</p>
        <button
          onClick={() => navigate("/")}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          Go back home
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-red-400">{error instanceof Error ? error.message : "Failed to load deployment"}</p>
        <button
          onClick={() => navigate("/")}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          Go back home
        </button>
      </div>
    );
  }

  if (!deployment) return null;

  async function handleDelete() {
    if (!confirm("Are you sure you want to stop and delete this deployment?")) return;
    setIsDeleting(true);
    try {
      await deleteDeployment(id!, sessionToken);
      removeSession(id!);
      navigate("/");
    } catch {
      setIsDeleting(false);
    }
  }

  const showTerminalButton = deployment.status === "running";
  const showPorts = deployment.status === "running" && deployment.portMappings.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-medium text-slate-300 truncate max-w-md">
                {deployment.repoUrl}
              </h1>
              <p className="text-xs text-slate-600 font-mono">{deployment.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={deployment.status} />
            {showTerminalButton && (
              <button
                onClick={toggleTerminal}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
              >
                <TerminalSquare className="w-4 h-4" />
                Terminal
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-800/50 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Stop
            </button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="max-w-7xl mx-auto w-full px-4 py-4 shrink-0">
        <div className="card p-4">
          <BuildProgress status={deployment.status} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 pb-4 flex gap-4 min-h-0 overflow-hidden">
        {/* Log Area */}
        <div className="flex-1 card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-1 border-b border-slate-700">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              {isLogConnected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Live
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  Connecting...
                </>
              )}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <LogStream />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 flex flex-col gap-4 shrink-0 overflow-y-auto">
          {deployment.status === "failed" && deployment.errorMessage && (
            <div className="card p-4 border-red-800/50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-red-400 mb-1">Error</h3>
                  <p className="text-sm text-red-300/80">{deployment.errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          <PortList
            ports={deployment.portMappings}
            deploymentId={deployment.id}
            sessionToken={sessionToken}
            onPortsUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["deployment", id] });
            }}
          />

          {(deployment.status === "running" || deployment.status === "deploying") && (
            <CountdownTimer
              expiresAt={deployment.expiresAt}
              extensionCount={deployment.extensionCount}
              deploymentId={deployment.id}
              sessionToken={sessionToken}
              onExtended={() => {
                queryClient.invalidateQueries({ queryKey: ["deployment", id] });
              }}
            />
          )}

          {showPorts && (
            <div className="card p-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Created</dt>
                  <dd className="text-slate-300">
                    {new Date(deployment.createdAt).toLocaleTimeString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Extensions</dt>
                  <dd className="text-slate-300">{deployment.extensionCount}/2</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Terminal */}
      {isTerminalOpen && deployment.status === "running" && (
        <div className="max-w-7xl mx-auto w-full px-4 pb-4 shrink-0">
          <Terminal
            deploymentId={deployment.id}
            sessionToken={sessionToken}
            onClose={toggleTerminal}
          />
        </div>
      )}
    </div>
  );
}
