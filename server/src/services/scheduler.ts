import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { satelliteService } from './satellite.js';
import { checkmkService } from './checkmk.js';
import { dnsService } from './dns.js';
import { reconcilerService } from './reconciler.js';
import { baselineService } from './baseline.js';
import { pingAllHosts } from './ping.js';
import type { SyncResult } from '../types/index.js';

const prisma = new PrismaClient();

class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private syncInProgress = false;

  start(): void {
    const cronExpression = `*/${config.SYNC_INTERVAL_MINUTES} * * * *`;
    console.log(`[SysCraft] Starting scheduler: sync every ${config.SYNC_INTERVAL_MINUTES} minutes (cron: ${cronExpression})`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('[SysCraft] Scheduled sync triggered');
      await this.runSync();
    });

    // Run initial sync on startup after a short delay
    setTimeout(() => {
      console.log('[SysCraft] Running initial sync...');
      this.runSync().catch((err) => {
        console.log('[SysCraft] Initial sync error:', err.message);
      });
    }, 5000);
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[SysCraft] Scheduler stopped');
    }
  }

  isRunning(): boolean {
    return this.syncInProgress;
  }

  async getLastSync(): Promise<{
    lastSync: any | null;
    isRunning: boolean;
  }> {
    const lastSync = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    return {
      lastSync,
      isRunning: this.syncInProgress,
    };
  }

  async getSyncHistory(limit = 20): Promise<any[]> {
    return prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async runSync(): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      console.log('[SysCraft] Sync already in progress, skipping');
      return [];
    }

    this.syncInProgress = true;
    const results: SyncResult[] = [];

    try {
      // Sync from Satellite
      const satResult = await this.syncSatellite();
      results.push(satResult);

      // Sync from Checkmk
      const cmkResult = await this.syncCheckmk();
      results.push(cmkResult);

      // Sync DNS (if enabled)
      const dnsResult = await this.syncDns();
      if (dnsResult) {
        results.push(dnsResult);
      }

      // Ping sweep (if enabled)
      try {
        const pingEnabledSetting = await prisma.setting.findUnique({ where: { key: 'ping_enabled' } });
        const pingEnabled = !pingEnabledSetting || pingEnabledSetting.value === 'true';
        if (pingEnabled) {
          const pingTimeoutSetting = await prisma.setting.findUnique({ where: { key: 'ping_timeout_ms' } });
          const pingBatchSetting = await prisma.setting.findUnique({ where: { key: 'ping_batch_size' } });
          const timeoutMs = parseInt(pingTimeoutSetting?.value || '3000', 10);
          const batchSize = parseInt(pingBatchSetting?.value || '10', 10);

          const allHostsForPing = await prisma.host.findMany({ select: { fqdn: true, ip: true } });
          const hostsWithIp = allHostsForPing.filter((h) => h.ip);
          console.log(`[SysCraft] Running ping sweep on ${hostsWithIp.length} hosts (batch=${batchSize}, timeout=${timeoutMs}ms)...`);
          const pingResults = await pingAllHosts(hostsWithIp, batchSize, timeoutMs);
          const alive = [...pingResults.values()].filter(Boolean).length;
          console.log(`[SysCraft] Ping sweep complete: ${alive}/${hostsWithIp.length} hosts responding`);
        }
      } catch (err) {
        console.log('[SysCraft] Ping sweep error:', (err as Error).message);
      }

      // Ensure all hosts are in the "All Hosts" group
      try {
        const allHostsGroup = await prisma.hostGroup.findUnique({ where: { name: 'All Hosts' } });
        if (allHostsGroup) {
          const allHosts = await prisma.host.findMany({ select: { fqdn: true } });
          const existing = await prisma.hostGroupMember.findMany({
            where: { groupId: allHostsGroup.id },
            select: { hostFqdn: true },
          });
          const existingSet = new Set(existing.map((e) => e.hostFqdn));
          const toAdd = allHosts.filter((h) => !existingSet.has(h.fqdn));
          if (toAdd.length > 0) {
            for (const h of toAdd) {
              try {
                await prisma.hostGroupMember.create({
                  data: { groupId: allHostsGroup.id, hostFqdn: h.fqdn },
                });
              } catch {
                // Skip duplicates
              }
            }
            console.log(`[SysCraft] Added ${toAdd.length} host(s) to "All Hosts" group`);
          }
        }
      } catch (err) {
        console.log('[SysCraft] All Hosts group update error:', (err as Error).message);
      }

      // Run reconciliation
      console.log('[SysCraft] Running post-sync reconciliation...');
      const recCount = await reconcilerService.reconcile();
      console.log(`[SysCraft] Reconciliation generated ${recCount} recommendations`);

      // Run compliance checks for all hosts
      console.log('[SysCraft] Running post-sync compliance checks...');
      const allHosts = await prisma.host.findMany({ select: { fqdn: true } });
      for (const host of allHosts) {
        try {
          await baselineService.checkCompliance(host.fqdn);
        } catch (err) {
          console.log(`[SysCraft] Compliance check failed for ${host.fqdn}: ${(err as Error).message}`);
        }
      }
      console.log(`[SysCraft] Compliance checks complete for ${allHosts.length} hosts`);

      // Log audit event
      const auditDetails: Record<string, unknown> = {
        satellite: { hostsFound: satResult.hostsFound, hostsUpdated: satResult.hostsUpdated },
        checkmk: { hostsFound: cmkResult.hostsFound, hostsUpdated: cmkResult.hostsUpdated },
        recommendations: recCount,
      };
      if (dnsResult) {
        auditDetails.dns = { hostsFound: dnsResult.hostsFound, hostsUpdated: dnsResult.hostsUpdated };
      }
      await prisma.auditLog.create({
        data: {
          action: 'sync_completed',
          target: 'system',
          details: JSON.stringify(auditDetails),
        },
      });

      return results;
    } catch (error) {
      console.log('[SysCraft] Sync error:', (error as Error).message);
      return results;
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncSatellite(): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'satellite',
        status: 'running',
        startedAt: new Date(),
      },
    });

    let hostsFound = 0;
    let hostsUpdated = 0;
    const errors: string[] = [];

    try {
      // Use fetchHostsRaw which returns FQDN, IP, and parsed data in one call
      const hosts = await satelliteService.fetchHostsRaw();
      hostsFound = hosts.length;

      for (const entry of hosts) {
        try {
          const fqdn = entry.fqdn;
          const ip = entry.ip;
          let satHost = entry.parsed;

          if (!fqdn) continue;

          // Enrich with facts (CPU, RAM, kernel)
          if (satHost?.hostId) {
            satHost = await satelliteService.enrichWithFacts(satHost.hostId, satHost);
          }

          const arch = satHost?.arch || '';
          const os = satHost?.osName || (arch ? `RHEL (${arch})` : 'RHEL');

          const macAddress = satHost?.macAddress || '';

          // Upsert host record
          await prisma.host.upsert({
            where: { fqdn },
            update: {
              ip: ip || undefined,
              os,
              arch,
              macAddress: macAddress || undefined,
              lastSeen: new Date(),
              updatedAt: new Date(),
            },
            create: {
              fqdn,
              ip: ip || '',
              os,
              arch,
              macAddress,
              status: 'new',
              lastSeen: new Date(),
            },
          });

          // Upsert host source
          const sourceId = satHost?.hostId ? String(satHost.hostId) : fqdn;
          await prisma.hostSource.upsert({
            where: {
              hostFqdn_source: { hostFqdn: fqdn, source: 'satellite' },
            },
            update: {
              sourceId,
              rawData: JSON.stringify(satHost || entry.raw),
              lastSynced: new Date(),
            },
            create: {
              hostFqdn: fqdn,
              source: 'satellite',
              sourceId,
              rawData: JSON.stringify(satHost || entry.raw),
              lastSynced: new Date(),
            },
          });

          hostsUpdated++;
        } catch (hostError) {
          const msg = `Error processing Satellite host ${entry.fqdn}: ${(hostError as Error).message}`;
          console.log(`[SysCraft] ${msg}`);
          errors.push(msg);
        }
      }

      const duration = Date.now() - startTime;

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length > 0 ? 'partial' : 'success',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] Satellite sync complete: ${hostsFound} found, ${hostsUpdated} updated in ${duration}ms`);

      return { source: 'satellite', hostsFound, hostsUpdated, errors, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = (error as Error).message;
      errors.push(msg);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failure',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] Satellite sync failed: ${msg}`);
      return { source: 'satellite', hostsFound, hostsUpdated, errors, duration };
    }
  }

  private async syncCheckmk(): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'checkmk',
        status: 'running',
        startedAt: new Date(),
      },
    });

    let hostsFound = 0;
    let hostsUpdated = 0;
    const errors: string[] = [];

    try {
      const hosts = await checkmkService.fetchHosts();
      hostsFound = hosts.length;

      for (const cmkHost of hosts) {
        try {
          const fqdn = cmkHost.hostname;
          if (!fqdn) continue;

          // Upsert host record
          await prisma.host.upsert({
            where: { fqdn },
            update: {
              lastSeen: new Date(),
              updatedAt: new Date(),
            },
            create: {
              fqdn,
              ip: '',
              os: '',
              arch: '',
              status: 'new',
              lastSeen: new Date(),
            },
          });

          // Upsert host source
          await prisma.hostSource.upsert({
            where: {
              hostFqdn_source: { hostFqdn: fqdn, source: 'checkmk' },
            },
            update: {
              sourceId: fqdn,
              rawData: JSON.stringify(cmkHost),
              lastSynced: new Date(),
            },
            create: {
              hostFqdn: fqdn,
              source: 'checkmk',
              sourceId: fqdn,
              rawData: JSON.stringify(cmkHost),
              lastSynced: new Date(),
            },
          });

          hostsUpdated++;
        } catch (hostError) {
          const msg = `Error processing Checkmk host ${cmkHost.hostname}: ${(hostError as Error).message}`;
          console.log(`[SysCraft] ${msg}`);
          errors.push(msg);
        }
      }

      const duration = Date.now() - startTime;

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length > 0 ? 'partial' : 'success',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] Checkmk sync complete: ${hostsFound} found, ${hostsUpdated} updated in ${duration}ms`);

      return { source: 'checkmk', hostsFound, hostsUpdated, errors, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = (error as Error).message;
      errors.push(msg);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failure',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] Checkmk sync failed: ${msg}`);
      return { source: 'checkmk', hostsFound, hostsUpdated, errors, duration };
    }
  }
  private async syncDns(): Promise<SyncResult | null> {
    // Check if DNS sync is enabled
    const dnsEnabledSetting = await prisma.setting.findUnique({ where: { key: 'dns_enabled' } });
    if (!dnsEnabledSetting || dnsEnabledSetting.value !== 'true') {
      return null;
    }

    // Reconfigure DNS service from DB settings
    const settings = await prisma.setting.findMany({
      where: { key: { startsWith: 'dns_' } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    dnsService.reconfigure(
      map.get('dns_server') || '127.0.0.1',
      parseInt(map.get('dns_port') || '53', 10),
      map.get('dns_zone') || 'ailab.local',
      parseInt(map.get('dns_batch_size') || '20', 10),
      parseInt(map.get('dns_batch_delay_ms') || '100', 10),
    );

    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'dns',
        status: 'running',
        startedAt: new Date(),
      },
    });

    let hostsFound = 0;
    let hostsUpdated = 0;
    const errors: string[] = [];

    try {
      // Fetch all hosts with their FQDN and IP
      const hosts = await prisma.host.findMany({
        select: { fqdn: true, ip: true },
      });

      const dnsResults = await dnsService.checkAllHosts(
        hosts.map((h) => ({ fqdn: h.fqdn, ip: h.ip }))
      );

      hostsFound = dnsResults.filter((r) => r.forwardIp !== null).length;

      for (const result of dnsResults) {
        try {
          if (result.forwardIp !== null) {
            // Host has an A record — upsert DNS source
            await prisma.hostSource.upsert({
              where: {
                hostFqdn_source: { hostFqdn: result.fqdn, source: 'dns' },
              },
              update: {
                sourceId: result.fqdn,
                rawData: JSON.stringify(result),
                lastSynced: new Date(),
              },
              create: {
                hostFqdn: result.fqdn,
                source: 'dns',
                sourceId: result.fqdn,
                rawData: JSON.stringify(result),
                lastSynced: new Date(),
              },
            });
            hostsUpdated++;
          } else {
            // No A record — remove DNS source if it existed
            await prisma.hostSource.deleteMany({
              where: {
                hostFqdn: result.fqdn,
                source: 'dns',
              },
            });
          }
        } catch (hostError) {
          const msg = `Error processing DNS for ${result.fqdn}: ${(hostError as Error).message}`;
          console.log(`[SysCraft] ${msg}`);
          errors.push(msg);
        }
      }

      const duration = Date.now() - startTime;

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length > 0 ? 'partial' : 'success',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] DNS sync complete: ${hostsFound} found, ${hostsUpdated} updated in ${duration}ms`);

      return { source: 'dns', hostsFound, hostsUpdated, errors, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = (error as Error).message;
      errors.push(msg);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failure',
          hostsFound,
          hostsUpdated,
          errors: JSON.stringify(errors),
          completedAt: new Date(),
        },
      });

      console.log(`[SysCraft] DNS sync failed: ${msg}`);
      return { source: 'dns', hostsFound, hostsUpdated, errors, duration };
    }
  }
}

export const schedulerService = new SchedulerService();
