import { EventEmitter } from 'node:events';

export interface LogEntry {
  id: number;
  deploymentId: string;
  timestamp: string;
  message: string;
  stream: 'stdout' | 'stderr' | 'system';
  stage: string | null;
}

export const logBus = new EventEmitter();
logBus.setMaxListeners(200);
