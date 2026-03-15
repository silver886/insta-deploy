import {
  CONTAINER_MEMORY_LIMIT,
  CONTAINER_CPU_QUOTA,
  CONTAINER_PIDS_LIMIT,
  BUILD_TIMEOUT_MS,
} from '@instadeploy/shared';
import { podman, podmanSpawn } from '../lib/podman.js';
import logger from '../lib/logger.js';

/** Fixed port inside every container where ttyd listens */
export const TTYD_CONTAINER_PORT = 7681;

export class ContainerService {
  async buildImage(
    contextPath: string,
    tag: string,
    onLog: (line: string) => void,
  ): Promise<void> {
    const args = ['build', '-t', tag, contextPath];

    await new Promise<void>((resolve, reject) => {
      const proc = podmanSpawn(args);
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('Container build timed out'));
      }, BUILD_TIMEOUT_MS);

      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.replace(/\n$/, '');
          if (trimmed.length > 0) {
            onLog(trimmed);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.replace(/\n$/, '');
          if (trimmed.length > 0) {
            onLog(trimmed);
          }
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`podman build failed (exit ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Inspect a container image and return its EXPOSE'd ports.
   */
  async getExposedPorts(imageTag: string): Promise<number[]> {
    let exposedPorts: number[] = [];
    try {
      const inspectJson = await podman(['inspect', imageTag, '--format', '{{json .Config.ExposedPorts}}']);
      const parsed = JSON.parse(inspectJson || '{}') ?? {};
      exposedPorts = Object.keys(parsed).map((k) => parseInt(k.split('/')[0], 10));
    } catch {
      // No exposed ports or inspect failed
    }

    if (exposedPorts.length === 0) {
      exposedPorts = [8080]; // Default fallback
    }

    return exposedPorts;
  }

  /**
   * Create and start a container with host port mappings.
   * portMaps: array of { containerPort, hostPort } to publish via -p.
   */
  async createAndStartContainer(
    imageTag: string,
    portMaps: Array<{ containerPort: number; hostPort: number }>,
  ): Promise<string> {
    const memoryMB = Math.floor(CONTAINER_MEMORY_LIMIT / (1024 * 1024));
    const cpuQuotaPct = CONTAINER_CPU_QUOTA / 1000;

    const portArgs = portMaps.flatMap(({ containerPort, hostPort }) => [
      '-p', `127.0.0.1:${hostPort}:${containerPort}`,
    ]);

    const args = [
      'run', '-d',
      '--memory', `${memoryMB}m`,
      '--memory-swap', `${memoryMB}m`,
      '--cpus', `${cpuQuotaPct / 100}`,
      '--pids-limit', String(CONTAINER_PIDS_LIMIT),
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      ...portArgs,
      imageTag,
    ];

    const containerId = await podman(args);

    logger.info({ containerId: containerId.substring(0, 12), imageTag, portMaps }, 'Container started');

    return containerId;
  }

  async stopAndRemove(containerId: string): Promise<void> {
    try {
      let imageId: string | null = null;
      try {
        imageId = await podman(['inspect', containerId, '--format', '{{.Image}}']);
      } catch {
        // Container may already be gone
      }

      try {
        await podman(['stop', '-t', '10', containerId]);
      } catch (err) {
        logger.warn({ containerId, err }, 'Error stopping container');
      }

      try {
        await podman(['rm', '-f', containerId]);
      } catch (err) {
        logger.warn({ containerId, err }, 'Error removing container');
      }

      if (imageId) {
        try {
          await podman(['rmi', '-f', imageId]);
        } catch (err) {
          logger.warn({ imageId, err }, 'Error removing image (may be in use)');
        }
      }
    } catch (err) {
      logger.error({ containerId, err }, 'Error during stopAndRemove');
    }
  }
}

export default ContainerService;
