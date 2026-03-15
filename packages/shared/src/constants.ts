export const PORT_RANGE_START = 10000;
export const PORT_RANGE_END = 20000;

export const MAX_REPO_SIZE_MB = 500;
export const CLONE_TIMEOUT_MS = 60_000;
export const BUILD_TIMEOUT_MS = 600_000;

export const DEFAULT_TTL_MS = 3_600_000; // 1 hour
export const MAX_EXTENSIONS = 2;
export const EXTENSION_TTL_MS = 1_800_000; // 30 min per extension

export const MAX_CONCURRENT_DEPLOYMENTS_PER_IP = 3;
export const MAX_DEPLOYMENTS_PER_HOUR_PER_IP = 10;
export const MAX_GLOBAL_RUNNING_CONTAINERS = 50;

export const CONTAINER_MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
export const CONTAINER_CPU_QUOTA = 50000; // 50% of one CPU
export const CONTAINER_PIDS_LIMIT = 256;

export const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes

export const DEPLOYMENT_STATUSES = [
  'queued',
  'cloning',
  'building',
  'deploying',
  'running',
  'expired',
  'failed',
  'stopped',
] as const;
