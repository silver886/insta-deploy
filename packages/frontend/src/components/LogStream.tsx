import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, ArrowDown } from "lucide-react";
import { useDeploymentStore, type LogLine } from "../store/deployment.store";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  cloning: "Cloning Repository",
  building: "Building Image",
  deploying: "Deploying Container",
  running: "Running",
  failed: "Failed",
};

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function getStreamColor(stream: LogLine["stream"]): string {
  switch (stream) {
    case "stderr":
      return "text-red-400";
    case "system":
      return "text-blue-400";
    case "stdout":
    default:
      return "text-slate-300";
  }
}

function getStageColor(stage: string): string {
  switch (stage) {
    case "cloning":
      return "text-cyan-400 border-cyan-800/50 bg-cyan-900/20";
    case "building":
      return "text-amber-400 border-amber-800/50 bg-amber-900/20";
    case "deploying":
      return "text-purple-400 border-purple-800/50 bg-purple-900/20";
    case "running":
      return "text-green-400 border-green-800/50 bg-green-900/20";
    case "failed":
      return "text-red-400 border-red-800/50 bg-red-900/20";
    default:
      return "text-slate-400 border-slate-700 bg-slate-800/50";
  }
}

interface StageGroup {
  stage: string;
  lines: LogLine[];
}

function groupByStage(logLines: LogLine[]): StageGroup[] {
  const groups: StageGroup[] = [];
  let currentStage: string | null = null;

  for (const line of logLines) {
    const stage = line.stage ?? "unknown";
    if (stage !== currentStage) {
      currentStage = stage;
      groups.push({ stage, lines: [] });
    }
    groups[groups.length - 1].lines.push(line);
  }

  return groups;
}

function StageSection({
  group,
  isLast,
}: {
  group: StageGroup;
  isLast: boolean;
}) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const stageColor = getStageColor(group.stage);
  const label = STAGE_LABELS[group.stage] ?? group.stage;

  const autoCollapsed = !isLast;
  const collapsed = manualToggle ?? autoCollapsed;

  const prevIsLastRef = useRef(isLast);
  useEffect(() => {
    if (prevIsLastRef.current !== isLast) {
      setManualToggle(null);
      prevIsLastRef.current = isLast;
    }
  }, [isLast]);

  return (
    <div className="mb-1">
      <button
        onClick={() => setManualToggle(!collapsed)}
        className={`flex items-center gap-2 w-full px-3 py-1.5 border rounded text-xs font-medium transition-colors hover:brightness-125 ${stageColor}`}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0" />
        )}
        {label}
        <span className="text-slate-500 font-normal ml-auto">
          {group.lines.length} {group.lines.length === 1 ? "line" : "lines"}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-2 border-l border-slate-800 ml-2 mt-1">
          {group.lines.map((line, index) => (
            <div
              key={index}
              className="flex gap-3 leading-relaxed hover:bg-slate-800/30 px-2"
            >
              <span className="text-slate-600 select-none shrink-0 text-xs mt-0.5">
                {formatTimestamp(line.timestamp)}
              </span>
              <span
                className={`${getStreamColor(line.stream)} break-all whitespace-pre-wrap text-sm`}
              >
                {line.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LogStream() {
  const logLines = useDeploymentStore((s) => s.logLines);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const groups = useMemo(() => groupByStage(logLines), [logLines]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setAutoScroll(isAtBottom);
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [logLines, autoScroll]);

  function scrollToBottom() {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-400">Build Logs</span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="log-viewer flex-1 overflow-y-auto p-4 min-h-0"
      >
        {groups.length === 0 ? (
          <div className="text-slate-600 text-sm italic">
            Waiting for logs...
          </div>
        ) : (
          groups.map((group, index) => (
            <StageSection
              key={`${group.stage}-${index}`}
              group={group}
              isLast={index === groups.length - 1}
            />
          ))
        )}
      </div>
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg transition-colors"
        >
          <ArrowDown className="w-3 h-3" />
          New logs
        </button>
      )}
    </div>
  );
}
