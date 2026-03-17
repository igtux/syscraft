import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface IpReuseIssue {
  type: 'mac_mismatch' | 'ip_conflict';
  fqdn: string;
  ip: string;
  detail: string;
  conflictingFqdn?: string;
}

export async function detectIpReuse(): Promise<IpReuseIssue[]> {
  const issues: IpReuseIssue[] = [];

  const hosts = await prisma.host.findMany({
    include: { sources: true },
  });

  // Check for multiple hosts sharing the same IP with different FQDNs
  const ipToHosts = new Map<string, string[]>();
  for (const host of hosts) {
    if (!host.ip) continue;
    const existing = ipToHosts.get(host.ip) || [];
    existing.push(host.fqdn);
    ipToHosts.set(host.ip, existing);
  }

  for (const [ip, fqdns] of ipToHosts) {
    if (fqdns.length > 1) {
      for (const fqdn of fqdns) {
        issues.push({
          type: 'ip_conflict',
          fqdn,
          ip,
          detail: `IP ${ip} is shared by multiple hosts: ${fqdns.join(', ')}`,
          conflictingFqdn: fqdns.find((f) => f !== fqdn),
        });
      }
    }
  }

  // Check stored MAC vs current MAC from Satellite facts
  for (const host of hosts) {
    if (!host.macAddress) continue;
    const satSource = host.sources.find((s) => s.source === 'satellite');
    if (!satSource) continue;

    try {
      const data = JSON.parse(satSource.rawData);
      const currentMac = (data.macAddress || '').toLowerCase().trim();
      const storedMac = host.macAddress.toLowerCase().trim();

      if (currentMac && storedMac && currentMac !== storedMac) {
        issues.push({
          type: 'mac_mismatch',
          fqdn: host.fqdn,
          ip: host.ip,
          detail: `MAC address changed from ${storedMac} to ${currentMac} — possible IP reuse or hardware replacement`,
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  return issues;
}
