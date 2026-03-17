import { PrismaClient } from '@prisma/client';
import { satelliteService } from './satellite.js';
import { checkmkService } from './checkmk.js';
import type { AgentStatusInfo } from '../types/index.js';

const prisma = new PrismaClient();

class BaselineService {
  async getBaselines() {
    return prisma.agentBaseline.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getEnabledBaselines() {
    return prisma.agentBaseline.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
    });
  }

  async createBaseline(data: {
    name: string;
    packageName: string;
    description?: string;
    requiredForGroups?: string[];
    enabled?: boolean;
  }) {
    return prisma.agentBaseline.create({
      data: {
        name: data.name,
        packageName: data.packageName,
        description: data.description || '',
        requiredForGroups: JSON.stringify(data.requiredForGroups || ['all']),
        enabled: data.enabled ?? true,
      },
    });
  }

  async updateBaseline(id: number, data: {
    name?: string;
    packageName?: string;
    description?: string;
    requiredForGroups?: string[];
    enabled?: boolean;
  }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.packageName !== undefined) updateData.packageName = data.packageName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.requiredForGroups !== undefined) updateData.requiredForGroups = JSON.stringify(data.requiredForGroups);
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    return prisma.agentBaseline.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteBaseline(id: number) {
    return prisma.agentBaseline.delete({ where: { id } });
  }

  async checkCompliance(fqdn: string): Promise<AgentStatusInfo[]> {
    const baselines = await this.getEnabledBaselines();
    const agents: AgentStatusInfo[] = [];

    const host = await prisma.host.findUnique({ where: { fqdn } });
    if (!host) {
      return baselines.map((b) => ({
        name: b.name,
        packageName: b.packageName,
        required: true,
        installed: false,
        running: false,
        version: null,
      }));
    }

    // Gather all evidence sources
    const sources = await prisma.hostSource.findMany({
      where: { hostFqdn: fqdn },
    });

    const hasSatelliteSource = sources.some((s) => s.source === 'satellite');
    const checkmkSource = sources.find((s) => s.source === 'checkmk');

    // 1. Try Satellite packages API
    const satelliteSource = sources.find((s) => s.source === 'satellite');
    let installedPackages: Array<{ name: string; version: string; release: string; arch: string }> = [];

    if (satelliteSource) {
      const rawData = JSON.parse(satelliteSource.rawData || '{}');
      const hostId = rawData.hostId || satelliteSource.sourceId;
      if (hostId) {
        installedPackages = await satelliteService.fetchHostPackages(hostId);
      }
    }

    const packageNameSet = new Set(installedPackages.map((p) => p.name.toLowerCase()));

    // 2. Parse Checkmk data for inference
    let checkmkUp = false;
    let checkmkServiceCount = 0;
    if (checkmkSource) {
      try {
        const cmkData = JSON.parse(checkmkSource.rawData || '{}');
        checkmkUp = cmkData.status === 'UP';
        checkmkServiceCount = (cmkData.services?.ok || 0) + (cmkData.services?.warn || 0) +
          (cmkData.services?.crit || 0);
      } catch { /* ignore */ }
    }

    for (const baseline of baselines) {
      const groups: string[] = JSON.parse(baseline.requiredForGroups || '["all"]');
      const required = groups.includes('all');
      const pkgName = baseline.packageName.toLowerCase();

      // Check from Satellite packages first
      let installed = packageNameSet.has(pkgName);
      let running = installed;
      let version: string | null = null;

      if (installed) {
        const matchingPkg = installedPackages.find((p) => p.name.toLowerCase() === pkgName);
        version = matchingPkg ? `${matchingPkg.version}-${matchingPkg.release}` : null;
      }

      // If not found in Satellite packages, use inference from other sources
      if (!installed) {
        switch (pkgName) {
          case 'check-mk-agent':
          case 'check_mk_agent':
            // If Checkmk has services for this host, agent is installed and running
            // (host status may be DOWN due to host-check config, but services prove agent works)
            if (checkmkServiceCount > 0) {
              installed = true;
              running = true;
            }
            break;

          case 'subscription-manager':
            // Infer installed only if the host actually registered (has content facet in Satellite)
            if (satelliteSource) {
              try {
                const satData = JSON.parse(satelliteSource.rawData || '{}');
                if (satData.registered) {
                  installed = true;
                  running = true;
                }
              } catch { /* ignore */ }
            }
            break;

          case 'katello-host-tools':
            // If Satellite can see installed packages, katello-host-tools must be present
            if (installedPackages.length > 0) {
              installed = true;
              running = true;
            }
            break;

          default:
            // For other packages, we can't infer — leave as false
            break;
        }
      }

      const agentStatus: AgentStatusInfo = {
        name: baseline.name,
        packageName: baseline.packageName,
        required,
        installed,
        running,
        version,
      };

      agents.push(agentStatus);

      // Upsert agent status in DB
      await prisma.agentStatus.upsert({
        where: {
          hostFqdn_agentName: {
            hostFqdn: fqdn,
            agentName: baseline.name,
          },
        },
        update: {
          installed,
          running,
          version,
          lastChecked: new Date(),
        },
        create: {
          hostFqdn: fqdn,
          agentName: baseline.name,
          installed,
          running,
          version,
          lastChecked: new Date(),
        },
      });
    }

    // Update compliance score on host
    const score = this.calculateComplianceScore(agents);
    await prisma.host.update({
      where: { fqdn },
      data: { complianceScore: score },
    });

    return agents;
  }

  calculateComplianceScore(agents: AgentStatusInfo[]): number {
    const requiredAgents = agents.filter((a) => a.required);
    if (requiredAgents.length === 0) return 100;

    const installedCount = requiredAgents.filter((a) => a.installed).length;
    return Math.round((installedCount / requiredAgents.length) * 100);
  }

  async getComplianceMatrix(): Promise<Array<{
    fqdn: string;
    ip: string;
    os: string;
    status: string;
    complianceScore: number;
    agents: AgentStatusInfo[];
  }>> {
    const hosts = await prisma.host.findMany({
      include: { agentStatuses: true },
      orderBy: { fqdn: 'asc' },
    });

    const baselines = await this.getEnabledBaselines();

    return hosts.map((host) => {
      const agents: AgentStatusInfo[] = baselines.map((baseline) => {
        const status = host.agentStatuses.find(
          (as) => as.agentName === baseline.name
        );
        const groups: string[] = JSON.parse(baseline.requiredForGroups || '["all"]');

        return {
          name: baseline.name,
          packageName: baseline.packageName,
          required: groups.includes('all'),
          installed: status?.installed ?? false,
          running: status?.running ?? false,
          version: status?.version ?? null,
        };
      });

      return {
        fqdn: host.fqdn,
        ip: host.ip,
        os: host.os,
        status: host.status,
        complianceScore: host.complianceScore,
        agents,
      };
    });
  }
}

export const baselineService = new BaselineService();
