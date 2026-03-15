import simpleGit from 'simple-git';
import { CLONE_TIMEOUT_MS } from '@instadeploy/shared';
import logger from '../lib/logger.js';

const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/,
  /^192\.168\.\d{1,3}\.\d{1,3}/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^169\.254\.169\.254/,
];

export class GitService {
  validateUrl(url: string): void {
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('Repository URL is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid repository URL format');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS repository URLs are allowed');
    }

    if (url.includes('@')) {
      throw new Error('URLs containing "@" are not allowed');
    }

    const hostname = parsed.hostname;
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new Error('URLs pointing to private IP addresses are not allowed');
      }
    }

    if (hostname === 'localhost' || hostname === '[::1]') {
      throw new Error('URLs pointing to localhost are not allowed');
    }
  }

  async clone(url: string, destPath: string): Promise<void> {
    this.validateUrl(url);

    logger.info({ url, destPath }, 'Cloning repository');

    const git = simpleGit({
      timeout: {
        block: CLONE_TIMEOUT_MS,
      },
    });

    await git.clone(url, destPath, ['--depth', '1', '--single-branch']);

    logger.info({ url, destPath }, 'Repository cloned successfully');
  }
}

export default GitService;
