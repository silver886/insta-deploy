import { Check } from "lucide-react";
import { clsx } from "clsx";
import type { DeploymentStatus } from "../lib/api";

interface BuildProgressProps {
  status: DeploymentStatus;
}

const PIPELINE_STEPS: { key: DeploymentStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "cloning", label: "Cloning" },
  { key: "building", label: "Building" },
  { key: "deploying", label: "Deploying" },
  { key: "running", label: "Running" },
];

const stepOrder: Record<string, number> = {
  queued: 0,
  cloning: 1,
  building: 2,
  deploying: 3,
  running: 4,
  failed: -1,
  expired: 5,
  stopped: 5,
};

export function BuildProgress({ status }: BuildProgressProps) {
  const currentIndex = stepOrder[status] ?? -1;
  const isFailed = status === "failed";

  return (
    <div className="flex items-center gap-1 w-full">
      {PIPELINE_STEPS.map((step, index) => {
        const isCompleted = currentIndex > index;
        const isCurrent = currentIndex === index;
        const isFailedStep = isFailed && isCurrent;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-all",
                  isCompleted && "bg-green-600 border-green-500 text-white",
                  isCurrent && !isFailedStep && "bg-amber-600 border-amber-400 text-white animate-pulse",
                  isFailedStep && "bg-red-600 border-red-400 text-white",
                  !isCompleted && !isCurrent && "bg-slate-800 border-slate-600 text-slate-500",
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={clsx(
                  "text-xs whitespace-nowrap",
                  isCompleted && "text-green-400",
                  isCurrent && !isFailedStep && "text-amber-300 font-medium",
                  isFailedStep && "text-red-400 font-medium",
                  !isCompleted && !isCurrent && "text-slate-500",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < PIPELINE_STEPS.length - 1 && (
              <div
                className={clsx(
                  "flex-1 h-0.5 mx-2 mt-[-1.25rem]",
                  isCompleted ? "bg-green-600" : "bg-slate-700",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
