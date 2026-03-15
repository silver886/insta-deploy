import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DeploymentStatus } from "../lib/api";

interface StatusBadgeProps {
  status: DeploymentStatus;
}

const statusConfig: Record<DeploymentStatus, { label: string; classes: string; pulse: boolean }> = {
  queued: { label: "Queued", classes: "bg-amber-900/50 text-amber-300 border-amber-700", pulse: true },
  cloning: { label: "Cloning", classes: "bg-amber-900/50 text-amber-300 border-amber-700", pulse: true },
  building: { label: "Building", classes: "bg-amber-900/50 text-amber-300 border-amber-700", pulse: true },
  deploying: { label: "Deploying", classes: "bg-amber-900/50 text-amber-300 border-amber-700", pulse: true },
  running: { label: "Running", classes: "bg-green-900/50 text-green-300 border-green-700", pulse: false },
  failed: { label: "Failed", classes: "bg-red-900/50 text-red-300 border-red-700", pulse: false },
  expired: { label: "Expired", classes: "bg-slate-700/50 text-slate-400 border-slate-600", pulse: false },
  stopped: { label: "Stopped", classes: "bg-slate-700/50 text-slate-400 border-slate-600", pulse: false },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border",
          config.classes,
        ),
      )}
    >
      <span
        className={clsx(
          "w-2 h-2 rounded-full",
          config.pulse && "animate-pulse-dot",
          status === "running" && "bg-green-400",
          status === "failed" && "bg-red-400",
          (status === "expired" || status === "stopped") && "bg-slate-400",
          (status === "queued" || status === "cloning" || status === "building" || status === "deploying") && "bg-amber-400",
        )}
      />
      {config.label}
    </span>
  );
}
