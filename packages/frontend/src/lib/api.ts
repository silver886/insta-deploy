export type DeploymentStatus =
  | "queued"
  | "cloning"
  | "building"
  | "deploying"
  | "running"
  | "failed"
  | "expired"
  | "stopped";

export type TunnelProtocol = "http" | "https" | "tcp" | "udp";

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
  portMappings: PortMapping[];
  errorMessage: string | null;
  expiresAt: string | null;
  extensionCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateDeploymentResponse {
  id: string;
  sessionToken: string;
}

export interface TerminalSession {
  terminalUrl: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error || body.message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function createDeployment(
  repoUrl: string,
): Promise<CreateDeploymentResponse> {
  const response = await fetch("/api/deployments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl }),
  });
  return handleResponse<CreateDeploymentResponse>(response);
}

export async function getDeployment(id: string, sessionToken: string): Promise<Deployment> {
  const response = await fetch(`/api/deployments/${id}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "x-session-token": sessionToken },
  });
  return handleResponse<Deployment>(response);
}

export async function deleteDeployment(id: string, sessionToken: string): Promise<void> {
  const response = await fetch(`/api/deployments/${id}`, {
    method: "DELETE",
    headers: { "x-session-token": sessionToken },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error || body.message || response.statusText);
  }
}

export async function extendDeployment(
  id: string,
  sessionToken: string,
): Promise<{ expiresAt: string; extensionCount: number }> {
  const response = await fetch(`/api/deployments/${id}/extend`, {
    method: "POST",
    headers: { "x-session-token": sessionToken },
  });
  return handleResponse(response);
}

export async function listDeployments(
  sessions: Array<{ id: string; sessionToken: string }>,
): Promise<{ deployments: Deployment[] }> {
  const response = await fetch("/api/deployments/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessions }),
  });
  return handleResponse(response);
}

export async function startTerminalSession(
  id: string,
  sessionToken: string,
): Promise<TerminalSession> {
  const response = await fetch(`/api/deployments/${id}/terminal`, {
    method: "POST",
    headers: { "x-session-token": sessionToken },
  });
  return handleResponse<TerminalSession>(response);
}

export async function changePortProtocol(
  deploymentId: string,
  containerPort: number,
  protocol: TunnelProtocol,
  sessionToken: string,
): Promise<{ portMappings: PortMapping[] }> {
  const response = await fetch(`/api/deployments/${deploymentId}/ports/${containerPort}/protocol`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-session-token": sessionToken,
    },
    body: JSON.stringify({ protocol }),
  });
  return handleResponse(response);
}
