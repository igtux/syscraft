import { PrismaClient } from '@prisma/client';
import { isHostAlive } from './ping.js';
import { classifyOs, getExpectedSystems } from './os-classifier.js';
import { detectIpReuse } from './ip-reuse.js';
import { generateCommands } from './command-generator.js';
import type { Discrepancy, RecommendationType, CommandEntry } from '../types/index.js';

const prisma = new PrismaClient();

class ReconcilerService {
  async reconcile(): Promise<number> {
    try {
      // Load settings
      const settingsRows = await prisma.setting.findMany();
      const settings = new Map(settingsRows.map((s) => [s.key, s.value]));
      const cleanupThresholdDays = parseInt(settings.get('cleanup_threshold_days') || '7', 10);
      const staleThresholdHours = parseInt(settings.get('stale_threshold_hours') || '72', 10);
      const staleThreshold = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000);

      // Clear all open recommendations (new cycle replaces old)
      await prisma.recommendation.deleteMany({ where: { status: 'open' } });

      const hosts = await prisma.host.findMany({
        include: { sources: true },
      });

      // Check DNS enabled
      const dnsEnabled = hosts.some((h) => h.sources.some((s) => s.source === 'dns'));

      let recCount = 0;

      // Build command context once
      const cmdCtxBase = {
        satelliteUrl: settings.get('satellite_url') || 'https://satellite.ailab.local',
        satelliteOrg: 'ailab',
        activationKey: settings.get('satellite_activation_key') || 'ailab-rhel9',
        checkmkUrl: settings.get('checkmk_url') || 'http://satellite.ailab.local:8080/cmk/check_mk/api/1.0',
        checkmkUser: settings.get('checkmk_user') || 'grafana',
        checkmkPassword: settings.get('checkmk_password') || 'grafana-auto-secret',
      };

      for (const host of hosts) {
        const sourceTypes = host.sources.map((s) => s.source);
        const inSatellite = sourceTypes.includes('satellite');
        const inCheckmk = sourceTypes.includes('checkmk');
        const inDns = sourceTypes.includes('dns');

        // a. Classify OS
        let osName = '';
        let agentType = '';
        const satSource = host.sources.find((s) => s.source === 'satellite');
        const cmkSource = host.sources.find((s) => s.source === 'checkmk');
        if (satSource) {
          try {
            const data = JSON.parse(satSource.rawData);
            osName = data.osName || '';
          } catch { /* ignore */ }
        }
        if (cmkSource) {
          try {
            const data = JSON.parse(cmkSource.rawData);
            agentType = data.agentType || '';
          } catch { /* ignore */ }
        }

        const osCategory = classifyOs(osName, agentType, host.fqdn);
        await prisma.host.update({
          where: { fqdn: host.fqdn },
          data: { osCategory },
        });

        // b. Check liveness
        const liveness = isHostAlive(
          {
            fqdn: host.fqdn,
            lastPingAt: host.lastPingAt,
            lastPingSuccess: host.lastPingSuccess,
            sources: host.sources.map((s) => ({
              source: s.source,
              rawData: s.rawData,
              lastSynced: s.lastSynced,
            })),
          },
          cleanupThresholdDays
        );

        const hostname = host.fqdn.split('.')[0];
        const cmdCtx = {
          ...cmdCtxBase,
          fqdn: host.fqdn,
          hostname,
          ip: host.ip,
          systemsPresent: sourceTypes,
        };

        // c. Unknown OS → classify recommendation only
        if (osCategory === 'unknown') {
          await this.createRecommendation(
            host.fqdn,
            'classify_os',
            'info',
            `Host "${host.fqdn}" has unknown OS category — classify before generating recommendations.`,
            'admin',
            generateCommands('classify_os', cmdCtx, settings)
          );
          recCount++;

          // Still update host status
          if (host.lastSeen < staleThreshold) {
            await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'stale' } });
          }
          continue;
        }

        // d. Host is alive
        if (liveness.alive) {
          const expectedSystems = getExpectedSystems(osCategory);

          // Missing sources
          if (expectedSystems.includes('satellite') && !inSatellite) {
            await this.createRecommendation(
              host.fqdn,
              'register_satellite',
              'high',
              `Host "${host.fqdn}" (${osCategory}) is alive but not registered in Satellite.`,
              'satellite',
              generateCommands('register_satellite', cmdCtx, settings)
            );
            recCount++;
          }

          if (expectedSystems.includes('checkmk') && !inCheckmk) {
            await this.createRecommendation(
              host.fqdn,
              'add_checkmk',
              'high',
              `Host "${host.fqdn}" (${osCategory}) is alive but not monitored in Checkmk.`,
              'checkmk',
              generateCommands('add_checkmk', cmdCtx, settings)
            );
            recCount++;
          }

          // DNS checks (only if DNS is enabled globally)
          if (dnsEnabled && expectedSystems.includes('dns')) {
            if (!inDns) {
              await this.createRecommendation(
                host.fqdn,
                'add_dns',
                'medium',
                `Host "${host.fqdn}" has no forward (A) DNS record.`,
                'dns',
                generateCommands('add_dns', cmdCtx, settings)
              );
              recCount++;
            } else {
              // Check DNS quality
              const dnsSource = host.sources.find((s) => s.source === 'dns');
              if (dnsSource) {
                try {
                  const dnsData = JSON.parse(dnsSource.rawData);
                  if (!dnsData.reverseHostname) {
                    await this.createRecommendation(
                      host.fqdn,
                      'fix_dns_reverse',
                      'low',
                      `Host "${host.fqdn}" has a forward A record but no reverse PTR record.`,
                      'dns',
                      generateCommands('fix_dns_reverse', cmdCtx, settings)
                    );
                    recCount++;
                  }
                  if (dnsData.forwardIp && dnsData.reverseHostname && !dnsData.reverseMatch) {
                    await this.createRecommendation(
                      host.fqdn,
                      'fix_dns_mismatch',
                      'medium',
                      `Host "${host.fqdn}" forward/reverse DNS records do not match.`,
                      'dns',
                      generateCommands('fix_dns_mismatch', cmdCtx, settings)
                    );
                    recCount++;
                  }
                } catch { /* ignore */ }
              }
            }
          }

          // Check orphans: in Checkmk but NOT expected in Satellite
          if (inCheckmk && !inSatellite && expectedSystems.includes('satellite')) {
            // Already covered by register_satellite above
          }

          // Update host status
          if (inSatellite && inCheckmk) {
            await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'active' } });
          } else if (inSatellite || inCheckmk) {
            await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'partial' } });
          } else {
            await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'new' } });
          }
        }

        // e. Dead beyond threshold
        else if (liveness.deadSinceDays !== null && liveness.deadSinceDays >= cleanupThresholdDays) {
          await this.createRecommendation(
            host.fqdn,
            'cleanup_dead',
            'critical',
            `Host "${host.fqdn}" has been unreachable for ${liveness.deadSinceDays} days — recommend cleanup from all systems.`,
            'host',
            generateCommands('cleanup_dead', cmdCtx, settings)
          );
          recCount++;

          await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'stale' } });
        }

        // f. Dead within threshold (stale but not cleanup yet)
        else if (!liveness.alive) {
          if (host.lastSeen < staleThreshold) {
            await prisma.host.update({ where: { fqdn: host.fqdn }, data: { status: 'stale' } });
          }
        }
      }

      // g. IP reuse detection
      const ipIssues = await detectIpReuse();
      for (const issue of ipIssues) {
        const hostname = issue.fqdn.split('.')[0];
        const cmdCtx = {
          ...cmdCtxBase,
          fqdn: issue.fqdn,
          hostname,
          ip: issue.ip,
          systemsPresent: [],
        };
        await this.createRecommendation(
          issue.fqdn,
          'ip_reuse',
          'high',
          issue.detail,
          'admin',
          generateCommands('ip_reuse', cmdCtx, settings)
        );
        recCount++;
      }

      console.log(`[SysCraft] Reconciliation complete: ${recCount} recommendations generated across ${hosts.length} hosts`);
      return recCount;
    } catch (error) {
      console.log('[SysCraft] Reconciliation error:', (error as Error).message);
      return 0;
    }
  }

  private async createRecommendation(
    hostFqdn: string,
    type: RecommendationType,
    severity: string,
    description: string,
    systemTarget: string,
    commands: CommandEntry[]
  ): Promise<void> {
    await prisma.recommendation.create({
      data: {
        hostFqdn,
        type,
        severity,
        description,
        systemTarget,
        commands: JSON.stringify(commands),
        status: 'open',
      },
    });
  }

  // Backward compat: map recommendations back to old discrepancy format
  async getDiscrepancies(filters?: { type?: string; severity?: string }): Promise<Discrepancy[]> {
    const where: any = { status: 'open' };
    if (filters?.severity) where.severity = filters.severity;

    const recs = await prisma.recommendation.findMany({
      where,
      include: { host: { select: { ip: true } } },
    });

    // Map recommendation types to old discrepancy types
    const typeMap: Record<string, Discrepancy['type']> = {
      add_checkmk: 'missing_in_checkmk',
      register_satellite: 'missing_in_satellite',
      add_dns: 'missing_in_dns',
      fix_dns_reverse: 'dns_reverse_missing',
      fix_dns_mismatch: 'dns_forward_reverse_mismatch',
      cleanup_dead: 'stale_entry',
      remove_checkmk: 'orphan',
    };

    let discrepancies: Discrepancy[] = recs
      .filter((r) => typeMap[r.type])
      .map((r) => ({
        fqdn: r.hostFqdn,
        ip: r.host.ip,
        type: typeMap[r.type] || 'stale_entry',
        description: r.description,
        system: r.systemTarget,
        suggestedAction: r.description,
        severity: (r.severity === 'critical' ? 'high' : r.severity) as 'high' | 'medium' | 'low',
      }));

    if (filters?.type) {
      discrepancies = discrepancies.filter((d) => d.type === filters.type);
    }

    return discrepancies;
  }
}

export const reconcilerService = new ReconcilerService();
