import { podman } from '../lib/podman.js';
import { TTYD_CONTAINER_PORT } from './container.service.js';
import type { TunnelService } from './tunnel.service.js';
import logger from '../lib/logger.js';

interface TtydSession {
  tunnelUrl: string;
  containerId: string;
}

export class TerminalService {
  private sessions = new Map<string, TtydSession>();
  private tunnelService: TunnelService;

  constructor(tunnelService: TunnelService) {
    this.tunnelService = tunnelService;
  }

  static async detectShell(containerId: string): Promise<string> {
    for (const shell of ['/bin/bash', '/bin/sh']) {
      try {
        await podman(['exec', containerId, 'test', '-x', shell]);
        return shell;
      } catch {
        continue;
      }
    }
    return '/bin/sh';
  }

  /**
   * Install ttyd inside the container by downloading it.
   */
  private async ensureTtyd(containerId: string): Promise<void> {
    // Check if already available
    try {
      await podman(['exec', containerId, 'test', '-x', '/tmp/ttyd']);
      return;
    } catch {
      // Not installed yet
    }

    logger.info({ containerId }, 'Installing ttyd inside container');

    // Detect architecture inside the container
    let arch: string;
    try {
      arch = await podman(['exec', containerId, 'uname', '-m']);
    } catch {
      arch = 'x86_64';
    }

    const ttydBinary = arch.includes('aarch64') || arch.includes('arm64')
      ? 'ttyd.aarch64'
      : 'ttyd.x86_64';

    // Download ttyd binary inside the container
    const url = `https://github.com/tsl0922/ttyd/releases/latest/download/${ttydBinary}`;

    try {
      await podman([
        'exec', containerId, 'sh', '-c',
        `command -v curl >/dev/null 2>&1 && curl -sLo /tmp/ttyd '${url}' || wget -qO /tmp/ttyd '${url}'`,
      ]);
    } catch (err) {
      throw new Error(
        `Failed to download ttyd inside container. Ensure curl or wget is available. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await podman(['exec', containerId, 'chmod', '+x', '/tmp/ttyd']);
  }

  async startSession(
    containerId: string,
    deploymentId: string,
    ttydHostPort: number,
  ): Promise<{ terminalUrl: string }> {
    const existing = this.sessions.get(deploymentId);
    if (existing) {
      return { terminalUrl: existing.tunnelUrl };
    }

    // Install ttyd inside the container on-demand
    await this.ensureTtyd(containerId);

    const shell = await TerminalService.detectShell(containerId);

    logger.info({ containerId, shell, ttydHostPort, deploymentId }, 'Starting ttyd inside container');

    // Start ttyd inside the container in the background
    await podman([
      'exec', '-d', containerId,
      '/tmp/ttyd',
      '--port', String(TTYD_CONTAINER_PORT),
      '--writable',
      shell,
    ]);

    // Wait a moment for ttyd to bind its port
    await new Promise((r) => setTimeout(r, 1000));

    // Create a cloudflared tunnel for ttyd
    const tunnelUrl = await this.tunnelService.startTunnel(
      `localhost:${ttydHostPort}`,
      'http',
      TTYD_CONTAINER_PORT,
      `${deploymentId}-terminal`,
    );

    this.sessions.set(deploymentId, { tunnelUrl, containerId });
    logger.info({ deploymentId, tunnelUrl }, 'ttyd tunnel started');

    return { terminalUrl: tunnelUrl };
  }

  stopSession(deploymentId: string): void {
    const session = this.sessions.get(deploymentId);
    if (!session) return;

    this.tunnelService.stopTunnels(`${deploymentId}-terminal`);

    podman(['exec', session.containerId, 'pkill', '-f', 'ttyd']).catch(() => {
      // Container may already be stopped
    });

    this.sessions.delete(deploymentId);
    logger.info({ deploymentId }, 'Stopped ttyd session');
  }

  getSession(deploymentId: string): TtydSession | undefined {
    return this.sessions.get(deploymentId);
  }

  stopAll(): void {
    for (const [id] of this.sessions) {
      this.stopSession(id);
    }
  }
}

export default TerminalService;
