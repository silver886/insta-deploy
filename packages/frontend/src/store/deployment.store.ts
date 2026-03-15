import { create } from "zustand";

export interface LogLine {
  timestamp: string;
  message: string;
  stream: "stdout" | "stderr" | "system";
  stage: string | null;
}

interface DeploymentStore {
  logLines: LogLine[];
  addLogLine: (line: LogLine) => void;
  clearLogs: () => void;
  isTerminalOpen: boolean;
  toggleTerminal: () => void;
  collapsedStages: Set<string>;
  toggleStageCollapse: (stage: string) => void;
}

export const useDeploymentStore = create<DeploymentStore>((set) => ({
  logLines: [],
  addLogLine: (line) =>
    set((state) => ({
      logLines: [...state.logLines, line],
    })),
  clearLogs: () => set({ logLines: [], collapsedStages: new Set() }),
  isTerminalOpen: false,
  toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
  collapsedStages: new Set<string>(),
  toggleStageCollapse: (stage) =>
    set((state) => {
      const next = new Set(state.collapsedStages);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return { collapsedStages: next };
    }),
}));
