import { eq, and, lt, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { CLEANUP_INTERVAL_MS } from '@instadeploy/shared';
import type { PortMapping } from '@instadeploy/shared';
import { deployments } from '../db/schema.js';
import type { ContainerService } from './container.service.js';
import type { TunnelService } from './tunnel.service.js';
import type { PortService } from './port.service.js';
import logger from '../lib/logger.js';

export class CleanupService {
  private db: LibSQLDatabase;
  private containerService: ContainerService;
  private tunnelService: TunnelService;
  private portService: PortService;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(db: LibSQLDatabase, containerService: ContainerService, tunnelService: TunnelService, portService: PortService) {
    this.db = db;
    this.containerService = containerService;
    this.tunnelService = tunnelService;
    this.portService = portService;
  }

  async cleanupDeployment(deploymentId: string): Promise<void> {
    logger.info({ deploymentId }, 'Cleaning up deployment');

    const results = await this.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId))
      .limit(1);

    const deployment = results[0];

    if (!deployment) {
      logger.warn({ deploymentId }, 'Deployment not found for cleanup');
      return;
    }

    this.tunnelService.stopTunnels(deploymentId);
    this.tunnelService.stopTunnels(`${deploymentId}-terminal`);

    // Release allocated host ports (exposed ports + ttyd port)
    const portsToRelease: number[] = [];
    if (deployment.portMappings) {
      try {
        const mappings: PortMapping[] = typeof deployment.portMappings === 'string'
          ? JSON.parse(deployment.portMappings)
          : deployment.portMappings;
        portsToRelease.push(...mappings.map((m) => m.hostPort).filter(Boolean));
      } catch {
        // Best effort
      }
    }
    if (deployment.metadata) {
      try {
        const meta = typeof deployment.metadata === 'string'
          ? JSON.parse(deployment.metadata)
          : deployment.metadata;
        if (meta?.ttydHostPort) {
          portsToRelease.push(meta.ttydHostPort);
        }
      } catch {
        // Best effort
      }
    }
    if (portsToRelease.length > 0) {
      this.portService.release(portsToRelease);
    }

    if (deployment.containerId) {
      await this.containerService.stopAndRemove(deployment.containerId);
    }

    await this.db
      .update(deployments)
      .set({
        status: 'expired',
        finishedAt: new Date().toISOString(),
      })
      .where(eq(deployments.id, deploymentId));

    logger.info({ deploymentId }, 'Deployment cleaned up');
  }

  async sweepExpired(): Promise<void> {
    logger.debug('Running expired deployment sweep');

    const now = new Date().toISOString();
    const expiredDeployments = await this.db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.status, 'running'),
          lt(deployments.expiresAt, now),
        ),
      );

    for (const deployment of expiredDeployments) {
      try {
        await this.cleanupDeployment(deployment.id);
      } catch (err) {
        logger.error({ deploymentId: deployment.id, err }, 'Failed to clean up expired deployment');
      }
    }

    if (expiredDeployments.length > 0) {
      logger.info({ count: expiredDeployments.length }, 'Swept expired deployments');
    }
  }

  async recoverOnStartup(): Promise<void> {
    // Mark stuck deployments as failed
    const stuckDeployments = await this.db
      .select()
      .from(deployments)
      .where(
        sql`${deployments.status} IN ('queued', 'cloning', 'building', 'deploying')`,
      );

    for (const d of stuckDeployments) {
      await this.db
        .update(deployments)
        .set({
          status: 'failed',
          errorMessage: 'Server restarted during deployment',
          finishedAt: new Date().toISOString(),
        })
        .where(eq(deployments.id, d.id));

      if (d.containerId) {
        try {
          await this.containerService.stopAndRemove(d.containerId);
        } catch {
          // Best effort
        }
      }
    }

    if (stuckDeployments.length > 0) {
      logger.info({ count: stuckDeployments.length }, 'Marked stuck deployments as failed after restart');
    }
  }

  startPeriodicSweep(): void {
    this.sweepInterval = setInterval(() => {
      this.sweepExpired().catch((err) => {
        logger.error({ err }, 'Periodic sweep failed');
      });
    }, CLEANUP_INTERVAL_MS);

    logger.info({ intervalMs: CLEANUP_INTERVAL_MS }, 'Started periodic cleanup sweep');
  }

  stopPeriodicSweep(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}

export default CleanupService;
