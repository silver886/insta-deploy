import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { DEFAULT_TTL_MS } from '@instadeploy/shared';
import type { PortMapping } from '@instadeploy/shared';
import { deployments, deployLogs } from '../db/schema.js';
import { GitService } from '../services/git.service.js';
import { ContainerService, TTYD_CONTAINER_PORT } from '../services/container.service.js';
import { TunnelService } from '../services/tunnel.service.js';
import { PortService } from '../services/port.service.js';
import { logBus, type LogEntry } from '../lib/log-bus.js';
import logger from '../lib/logger.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const gitService = new GitService();
const containerService = new ContainerService();
const portService = new PortService();

export const tunnelService = new TunnelService();

// Per-deployment stage tracking (avoids global variable race condition)
const deploymentStages = new Map<string, string>();

async function publishLog(
  db: LibSQLDatabase,
  deploymentId: string,
  message: string,
  stream: 'stdout' | 'stderr' | 'system' = 'system',
): Promise<void> {
  const now = new Date().toISOString();
  const stage = deploymentStages.get(deploymentId) ?? null;

  const result = await db.insert(deployLogs).values({
    deploymentId,
    message,
    stream,
    stage,
    createdAt: now,
  }).returning({ id: deployLogs.id });

  const id = result[0]?.id ?? 0;

  const entry: LogEntry = {
    id,
    deploymentId,
    timestamp: now,
    message,
    stream,
    stage,
  };

  logBus.emit('log', entry);
}

export async function publishDeploymentLog(
  db: LibSQLDatabase,
  deploymentId: string,
  message: string,
  stage: string,
  stream: 'stdout' | 'stderr' | 'system' = 'system',
): Promise<void> {
  const now = new Date().toISOString();

  const result = await db.insert(deployLogs).values({
    deploymentId,
    message,
    stream,
    stage,
    createdAt: now,
  }).returning({ id: deployLogs.id });

  const id = result[0]?.id ?? 0;

  const entry: LogEntry = {
    id,
    deploymentId,
    timestamp: now,
    message,
    stream,
    stage,
  };

  logBus.emit('log', entry);
}

async function updateStatus(
  db: LibSQLDatabase,
  deploymentId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  deploymentStages.set(deploymentId, status);
  const updateData: Record<string, unknown> = { status, ...extra };

  if (status === 'cloning' || status === 'building' || status === 'deploying') {
    updateData.startedAt = new Date().toISOString();
  }

  await db
    .update(deployments)
    .set(updateData)
    .where(eq(deployments.id, deploymentId));

  await publishLog(db, deploymentId, `Status changed to: ${status}`);
}

export async function processDeployment(
  db: LibSQLDatabase,
  deploymentId: string,
  repoUrl: string,
): Promise<void> {
  let workDir: string | null = null;
  let allocatedHostPorts: number[] = [];
  deploymentStages.set(deploymentId, 'queued');

  try {
    // Step 1: Clone
    await updateStatus(db, deploymentId, 'cloning');
    await publishLog(db, deploymentId, `Cloning repository: ${repoUrl}`);

    workDir = await mkdtemp(join(tmpdir(), `instadeploy-${deploymentId}-`));
    const clonePath = join(workDir, 'repo');

    await gitService.clone(repoUrl, clonePath);
    await publishLog(db, deploymentId, 'Repository cloned successfully');

    // Step 2: Build
    const imageTag = `instadeploy-${deploymentId}`;
    await updateStatus(db, deploymentId, 'building', { imageTag });
    await publishLog(db, deploymentId, `Building container image: ${imageTag}`);

    await containerService.buildImage(clonePath, imageTag, (line: string) => {
      publishLog(db, deploymentId, line, 'stdout').catch(() => {});
    });
    await publishLog(db, deploymentId, 'Container image built successfully');

    // Step 3: Deploy — start container with host port mappings
    await updateStatus(db, deploymentId, 'deploying');
    await publishLog(db, deploymentId, 'Starting container');

    const exposedPorts = await containerService.getExposedPorts(imageTag);

    // Allocate host ports: one per exposed port + one for ttyd
    const allContainerPorts = [...exposedPorts, TTYD_CONTAINER_PORT];
    const hostPorts = portService.allocate(allContainerPorts.length);
    allocatedHostPorts = hostPorts;
    const portMaps = allContainerPorts.map((cp, i) => ({
      containerPort: cp,
      hostPort: hostPorts[i],
    }));

    const containerId = await containerService.createAndStartContainer(imageTag, portMaps);

    // Build a lookup for container→host port
    const hostPortFor = new Map(portMaps.map(({ containerPort, hostPort }) => [containerPort, hostPort]));
    const ttydHostPort = hostPortFor.get(TTYD_CONTAINER_PORT)!;

    await publishLog(db, deploymentId, `Container started: ${containerId.substring(0, 12)}`);

    // Step 4: Running — set status, then start tunnels
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

    await updateStatus(db, deploymentId, 'running', {
      containerId,
      metadata: JSON.stringify({ ttydHostPort }),
      expiresAt: expiresAt.toISOString(),
    });

    await publishLog(db, deploymentId, `Deployment is running. Expires at: ${expiresAt.toISOString()}`);

    // Start cloudflared tunnels pointing to localhost:hostPort
    await publishLog(db, deploymentId, 'Setting up tunnels...');
    const portMappings: PortMapping[] = [];

    for (const containerPort of exposedPorts) {
      const hostPort = hostPortFor.get(containerPort)!;
      let tunnelUrl: string | null = null;
      try {
        tunnelUrl = await tunnelService.startTunnel(
          `localhost:${hostPort}`,
          'http',
          containerPort,
          deploymentId,
        );
        await publishLog(db, deploymentId, `Tunnel ready: ${tunnelUrl} → container port ${containerPort} (http)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await publishLog(db, deploymentId, `Failed to create tunnel for port ${containerPort}: ${msg}`, 'stderr');
      }

      portMappings.push({
        containerPort,
        hostPort,
        protocol: 'http',
        tunnelUrl,
      });
    }

    await db
      .update(deployments)
      .set({ portMappings: JSON.stringify(portMappings) })
      .where(eq(deployments.id, deploymentId));

    logger.info({ deploymentId, containerId, portMappings }, 'Deployment completed successfully');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ deploymentId, err }, 'Deployment failed');

    await updateStatus(db, deploymentId, 'failed', {
      errorMessage,
      finishedAt: new Date().toISOString(),
    });

    await publishLog(db, deploymentId, `Deployment failed: ${errorMessage}`, 'stderr');

    try {
      tunnelService.stopTunnels(deploymentId);

      if (allocatedHostPorts.length > 0) {
        portService.release(allocatedHostPorts);
      }

      const results = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .limit(1);

      const deployment = results[0];

      if (deployment?.containerId) {
        await containerService.stopAndRemove(deployment.containerId);
      }
    } catch (cleanupErr) {
      logger.error({ deploymentId, cleanupErr }, 'Cleanup after failure also failed');
    }
  } finally {
    deploymentStages.delete(deploymentId);
    if (workDir) {
      rm(workDir, { recursive: true, force: true }).catch((err: unknown) => {
        logger.warn({ workDir, err }, 'Failed to remove work directory');
      });
    }
  }
}
