import { PORT_RANGE_START, PORT_RANGE_END } from '@instadeploy/shared';

export class PortService {
  private static allocatedPorts: Set<number> = new Set();

  /** Restore previously allocated ports (e.g. after restart) */
  restore(ports: number[]): void {
    for (const port of ports) {
      PortService.allocatedPorts.add(port);
    }
  }

  allocate(count: number): number[] {
    const ports: number[] = [];
    const rangeSize = PORT_RANGE_END - PORT_RANGE_START;
    let attempts = 0;
    const maxAttempts = rangeSize;

    while (ports.length < count && attempts < maxAttempts) {
      const port = PORT_RANGE_START + Math.floor(Math.random() * rangeSize);
      if (!PortService.allocatedPorts.has(port) && !ports.includes(port)) {
        ports.push(port);
        PortService.allocatedPorts.add(port);
      }
      attempts++;
    }

    if (ports.length < count) {
      for (const p of ports) {
        PortService.allocatedPorts.delete(p);
      }
      throw new Error(`Unable to allocate ${count} ports; only ${ports.length} available`);
    }

    return ports;
  }

  release(ports: number[]): void {
    for (const port of ports) {
      PortService.allocatedPorts.delete(port);
    }
  }

  get allocatedCount(): number {
    return PortService.allocatedPorts.size;
  }
}

export default PortService;
