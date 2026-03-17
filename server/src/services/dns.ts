import dns from 'dns';
import type { DnsHostData } from '../types/index.js';

class DnsService {
  private resolver: dns.promises.Resolver;
  private server = '127.0.0.1';
  private port = 53;
  private zone = 'ailab.local';
  private batchSize = 20;
  private batchDelayMs = 100;

  constructor() {
    this.resolver = new dns.promises.Resolver();
    this.resolver.setServers([`${this.server}:${this.port}`]);
  }

  reconfigure(server: string, port: number, zone?: string, batchSize?: number, batchDelayMs?: number): void {
    this.server = server;
    this.port = port;
    if (zone) this.zone = zone;
    if (batchSize) this.batchSize = batchSize;
    if (batchDelayMs !== undefined) this.batchDelayMs = batchDelayMs;

    this.resolver = new dns.promises.Resolver();
    this.resolver.setServers([`${this.server}:${this.port}`]);
    console.log(`[SysCraft] DNS service reconfigured: server=${this.server}:${this.port} zone=${this.zone}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.resolver.resolveSoa(this.zone);
      return true;
    } catch {
      return false;
    }
  }

  async resolveForward(fqdn: string): Promise<string | null> {
    try {
      const addresses = await this.resolver.resolve4(fqdn);
      return addresses.length > 0 ? addresses[0] : null;
    } catch {
      return null;
    }
  }

  async resolveReverse(ip: string): Promise<string | null> {
    try {
      const hostnames = await this.resolver.reverse(ip);
      return hostnames.length > 0 ? hostnames[0] : null;
    } catch {
      return null;
    }
  }

  async checkHost(fqdn: string, knownIp: string): Promise<DnsHostData> {
    const forwardIp = await this.resolveForward(fqdn);
    let reverseHostname: string | null = null;

    // Only do reverse lookup if we got a forward IP
    const ipToReverse = forwardIp || knownIp;
    if (ipToReverse) {
      reverseHostname = await this.resolveReverse(ipToReverse);
    }

    // Normalize: strip trailing dot from PTR result
    const normalizedReverse = reverseHostname?.replace(/\.$/, '') ?? null;
    const normalizedFqdn = fqdn.replace(/\.$/, '').toLowerCase();

    const forwardMatch = forwardIp !== null && forwardIp === knownIp;
    const reverseMatch = normalizedReverse !== null && normalizedReverse.toLowerCase() === normalizedFqdn;

    return {
      fqdn,
      forwardIp,
      reverseHostname: normalizedReverse,
      forwardMatch,
      reverseMatch,
      lastChecked: new Date().toISOString(),
    };
  }

  async checkAllHosts(hosts: Array<{ fqdn: string; ip: string }>): Promise<DnsHostData[]> {
    const results: DnsHostData[] = [];

    for (let i = 0; i < hosts.length; i += this.batchSize) {
      const batch = hosts.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map((h) => this.checkHost(h.fqdn, h.ip))
      );
      results.push(...batchResults);

      // Delay between batches (skip after the last batch)
      if (i + this.batchSize < hosts.length && this.batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchDelayMs));
      }
    }

    return results;
  }

  async getRecordCount(hosts: DnsHostData[]): Promise<number> {
    return hosts.filter((h) => h.forwardIp !== null).length;
  }

  getServer(): string {
    return this.server;
  }

  getPort(): number {
    return this.port;
  }

  getZone(): string {
    return this.zone;
  }
}

export const dnsService = new DnsService();
