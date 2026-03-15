export type DeploymentStatus =
  | 'queued'
  | 'cloning'
  | 'building'
  | 'deploying'
  | 'running'
  | 'expired'
  | 'failed'
  | 'stopped';

export type TunnelProtocol = 'http' | 'https' | 'tcp' | 'udp';

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: TunnelProtocol;
  tunnelUrl: string | null;
}

export interface Deployment {
  id: string;
  repoUrl: string;
  status: DeploymentStatus;
  imageTag: string | null;
  containerId: string | null;
  portMappings: PortMapping[];
  errorMessage: string | null;
  creatorIp: string;
  sessionToken: string;
  expiresAt: string | null;
  extensionCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateDeploymentRequest {
  repoUrl: string;
}

export interface CreateDeploymentResponse {
  id: string;
  sessionToken: string;
}

export interface DeploymentResponse {
  id: string;
  repoUrl: string;
  status: DeploymentStatus;
  portMappings: PortMapping[];
  errorMessage: string | null;
  expiresAt: string | null;
  extensionCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LogEvent {
  id: number;
  timestamp: string;
  message: string;
  stream: 'stdout' | 'stderr' | 'system';
  stage: DeploymentStatus | null;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
