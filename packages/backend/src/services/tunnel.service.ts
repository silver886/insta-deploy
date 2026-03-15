import { type ChildProcess, spawn } from 'node:child_process';
import type { TunnelProtocol } from '@instadeploy/shared';
import logger from '../lib/logger.js';

interface TunnelInfo {
  url: string;
  process: ChildProcess;
  containerPort: number;
  protocol: TunnelProtocol;
}

export class TunnelService {
  private tunnels = new Map<string, TunnelInfo[]>();

  async startTunnel(
    originAddress: string,
    protocol: TunnelProtocol,
    containerPort: number,
    deploymentId: string,
  ): Promise<string> {
    const origin = `${protocol}://${originAddress}`;
    const args = ['tunnel', '--url', origin, '--no-autoupdate'];

    logger.info({ deploymentId, origin, args }, 'Starting cloudflared tunnel');

    const proc = spawn('cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const url = await new Promise<string>((resolve, reject) => {
      let stderr = '';
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Tunnel startup timed out. stderr: ${stderr.slice(-500)}`));
      }, 30_000);

      const onData = (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        const match = chunk.match(/https?:\/\/[^\s|]+\.trycloudflare\.com/);
        if (match) {
          clearTimeout(timeout);
          proc.stderr?.off('data', onData);
          resolve(match[0]);
        }
      };

      proc.stderr?.on('data', onData);

      proc.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start cloudflared: ${err.message}`));
      });

      proc.on('exit', (code: number | null) => {
        clearTimeout(timeout);
        if (code !== null && code !== 0) {
          reject(new Error(`cloudflared exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });
    });

    const existing = this.tunnels.get(deploymentId) ?? [];
    existing.push({ url, process: proc, containerPort, protocol });
    this.tunnels.set(deploymentId, existing);

    logger.info({ deploymentId, tunnelUrl: url, containerPort, protocol }, 'Cloudflared tunnel started');
    return url;
  }

  /**
   * Stop a tunnel by container port and start a new one with a different protocol.
   */
  async restartTunnel(
    originAddress: string,
    containerPort: number,
    newProtocol: TunnelProtocol,
    deploymentId: string,
  ): Promise<string> {
    this.stopTunnelByContainerPort(deploymentId, containerPort);
    return this.startTunnel(originAddress, newProtocol, containerPort, deploymentId);
  }

  stopTunnelByContainerPort(deploymentId: string, containerPort: number): void {
    const tunnels = this.tunnels.get(deploymentId);
    if (!tunnels) return;

    const idx = tunnels.findIndex((t) => t.containerPort === containerPort);
    if (idx === -1) return;

    try {
      tunnels[idx].process.kill('SIGTERM');
    } catch {
      // Process may already be gone
    }

    tunnels.splice(idx, 1);
    if (tunnels.length === 0) {
      this.tunnels.delete(deploymentId);
    }

    logger.info({ deploymentId, containerPort }, 'Stopped single cloudflared tunnel');
  }

  stopTunnels(deploymentId: string): void {
    const tunnels = this.tunnels.get(deploymentId);
    if (!tunnels) return;

    for (const tunnel of tunnels) {
      try {
        tunnel.process.kill('SIGTERM');
      } catch {
        // Process may already be gone
      }
    }

    this.tunnels.delete(deploymentId);
    logger.info({ deploymentId }, 'Stopped cloudflared tunnels');
  }

  stopAll(): void {
    for (const [deploymentId] of this.tunnels) {
      this.stopTunnels(deploymentId);
    }
  }
}
