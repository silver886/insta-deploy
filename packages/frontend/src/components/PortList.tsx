import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { changePortProtocol, type PortMapping, type TunnelProtocol } from "../lib/api";

const PROTOCOLS: TunnelProtocol[] = ["http", "https", "tcp", "udp"];

interface PortListProps {
  ports: PortMapping[];
  deploymentId: string;
  sessionToken: string;
  onPortsUpdated: () => void;
}

export function PortList({ ports, deploymentId, sessionToken, onPortsUpdated }: PortListProps) {
  const [switchingPort, setSwitchingPort] = useState<number | null>(null);

  if (ports.length === 0) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Exposed Ports
        </h3>
        <p className="text-slate-500 text-sm">No ports exposed</p>
      </div>
    );
  }

  async function handleProtocolChange(port: PortMapping, newProtocol: TunnelProtocol) {
    if (port.protocol === newProtocol) return;
    setSwitchingPort(port.containerPort);
    try {
      await changePortProtocol(deploymentId, port.containerPort, newProtocol, sessionToken);
      onPortsUpdated();
    } catch {
      // Failed — will stay on old protocol
    } finally {
      setSwitchingPort(null);
    }
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
        <Globe className="w-4 h-4" />
        Exposed Ports
      </h3>
      <div className="flex flex-col gap-2">
        {ports.map((port) => {
          const isTunnel = !!port.tunnelUrl;
          const isSwitching = switchingPort === port.containerPort;
          const tunnelPending = !port.tunnelUrl;

          return (
            <div
              key={port.containerPort}
              className="flex flex-col gap-1.5 px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-slate-300">
                    :{port.containerPort}
                  </span>
                  {isTunnel && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/30">
                      tunnel
                    </span>
                  )}
                  {(isSwitching || tunnelPending) && (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  )}
                </div>
              </div>
              {tunnelPending ? (
                <span className="text-xs text-slate-500">Setting up tunnel...</span>
              ) : (
                <a
                  href={port.tunnelUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 truncate transition-colors group"
                >
                  <ExternalLink className="w-3 h-3 shrink-0 group-hover:text-blue-300" />
                  <span className="truncate">{port.tunnelUrl}</span>
                </a>
              )}
              {isTunnel && (
                <div className="flex items-center gap-1 mt-0.5">
                  {PROTOCOLS.map((proto) => (
                    <button
                      key={proto}
                      type="button"
                      disabled={isSwitching}
                      onClick={() => handleProtocolChange(port, proto)}
                      className={`px-1.5 py-0.5 text-[10px] uppercase rounded border transition-colors ${
                        port.protocol === proto
                          ? "bg-blue-600/30 border-blue-500/50 text-blue-300"
                          : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
                      } disabled:opacity-50`}
                    >
                      {proto}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
