import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

export async function podman(args: string[]): Promise<string> {
  logger.debug({ args }, 'podman command');
  const { stdout, stderr } = await execFileAsync('podman', args, {
    maxBuffer: 50 * 1024 * 1024,
  });
  if (stderr) {
    logger.debug({ stderr: stderr.trim() }, 'podman stderr');
  }
  return stdout.trim();
}

export function podmanSpawn(args: string[]) {
  logger.debug({ args }, 'podman spawn');
  return spawn('podman', args);
}
