import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { satelliteService } from './satellite.js';
import { checkmkService } from './checkmk.js';
import { dnsService } from './dns.js';
import { vcsaService } from './vcsa.js';
import { reconcilerService } from './reconciler.js';
import { baselineService } from './baseline.js';
import { pingAllHosts } from './ping.js';
import { hostEventService } from './host-events.js';
import { webhookService } from './webhook.js';
import type { SyncResult } from '../types/index.js';

const prisma = new PrismaClient();

/** Map of adapter key -> resolved DataSource id (populated at the start of each sync) */
interface DataSourceMap {
  satellite?: number;
  checkmk?: number;
  dns?: number;
  vcsa?: number;
}

class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private dailyCron: cron.ScheduledTask | null = null;
  private syncInProgress = false;

  start(): void {
    const cronExpression = `*/${config.SYNC_INTERVAL_MINUTES} * * * *`;
    console.log(`[SysCraft] Starting scheduler: sync every ${config.SYNC_INTERVAL_MINUTES} minutes (cron: ${cronExpression})`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('[SysCraft] Scheduled sync triggered');
      await this.runSync();
    });

    // Daily summary webhook + event retention cleanup (midnight)
    this.dailyCron = cron.schedule('0 0 * * *', async () => {
      console.log('[SysCraft] Running daily summary + cleanup...');
      try {
        // Fire daily_summary webhook
        const [hostCounts, recCounts] = await Promise.all([
          prisma.host.groupBy({ by: ['status'], _count: true }),
          prisma.recommendation.groupBy({ by: ['severity'], where: { status: 'open' }, _count: true }),
        ]);
        const summary: Record<string, any> = { hosts: {}, recommendations: {} };
        for (const h of hostCounts) summary.hosts[h.status] = h._count;
        for (const r of recCounts) summary.recommendations[r.severity] = r._count;
        summary.timestamp = new Date().toISOString();
        await webhookService.fire('daily_summary', summary);

        // Event retention cleanup (default 30 days)
        const retentionSetting = await prisma.setting.findUnique({ where: { key: 'event_retention_days' } });
        const retentionDays = parseInt(retentionSetting?.value || '30', 10);
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const [deletedEvents, deletedLogs] = await Promise.all([
          prisma.hostEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
          prisma.webhookLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        ]);
        if (deletedEvents.count > 0 || deletedLogs.count > 0) {
          console.log(`[SysCraft] Retention cleanup: ${deletedEvents.count} events + ${deletedLogs.count} webhook logs older than ${retentionDays} days`);
        }
      } catch (err) {
        console.log('[SysCraft] Daily summary error:', (err as Error).message);
      }
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
    }
    if (this.dailyCron) {
      this.dailyCron.stop();
      this.dailyCron = null;
    }
    console.log('[SysCraft] Scheduler stopped');
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
      // Look up DataSource records by adapter key so we can set dataSourceId on
      // HostSource and SyncLog rows.
      const dataSources = await prisma.dataSource.findMany({
        where: { adapter: { in: ['satellite', 'checkmk', 'dns', 'vcsa'] } },
      });
      const dsMap: DataSourceMap = {};
      for (const ds of dataSources) {
        if (ds.adapter === 'satellite') dsMap.satellite = ds.id;
        else if (ds.adapter === 'checkmk') dsMap.checkmk = ds.id;
        else if (ds.adapter === 'dns') dsMap.dns = ds.id;
        else if (ds.adapter === 'vcsa') dsMap.vcsa = ds.id;
      }

      // Sync from Satellite
      const satResult = await this.syncSatellite(dsMap.satellite);
      results.push(satResult);

      // Sync from Checkmk
      const cmkResult = await this.syncCheckmk(dsMap.checkmk);
      results.push(cmkResult);

      // Sync DNS (if enabled)
      const dnsResult = await this.syncDns(dsMap.dns);
      if (dnsResult) {
        results.push(dnsResult);
      }

      // Sync from vCSA (if enabled)
      const vcsaResult = await this.syncVcsa(dsMap.vcsa);
      if (vcsaResult) {
        results.push(vcsaResult);
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

      // Fire sync_completed webhook
      webhookService.fire('sync_completed', {
        satellite: { hostsFound: satResult.hostsFound, hostsUpdated: satResult.hostsUpdated },
        checkmk: { hostsFound: cmkResult.hostsFound, hostsUpdated: cmkResult.hostsUpdated },
        dns: dnsResult ? { hostsFound: dnsResult.hostsFound, hostsUpdated: dnsResult.hostsUpdated } : null,
        vcsa: vcsaResult ? { hostsFound: vcsaResult.hostsFound, hostsUpdated: vcsaResult.hostsUpdated } : null,
      }).catch(() => {});

      // Log audit event — details is Json, pass object directly
      const auditDetails: Record<string, unknown> = {
        satellite: { hostsFound: satResult.hostsFound, hostsUpdated: satResult.hostsUpdated },
        checkmk: { hostsFound: cmkResult.hostsFound, hostsUpdated: cmkResult.hostsUpdated },
        recommendations: recCount,
      };
      if (dnsResult) {
        auditDetails.dns = { hostsFound: dnsResult.hostsFound, hostsUpdated: dnsResult.hostsUpdated };
      }
      if (vcsaResult) {
        auditDetails.vcsa = { hostsFound: vcsaResult.hostsFound, hostsUpdated: vcsaResult.hostsUpdated };
      }
      await prisma.auditLog.create({
        data: {
          action: 'sync_completed',
          target: 'system',
          details: auditDetails as any,
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

  private async syncSatellite(dataSourceId?: number): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'satellite',
        dataSourceId: dataSourceId ?? null,
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Batch load existing hosts for event diffing
    const existingHosts = new Map<string, { ip: string; macAddress: string }>();
    const allHosts = await prisma.host.findMany({ select: { fqdn: true, ip: true, macAddress: true } });
    for (const h of allHosts) existingHosts.set(h.fqdn, { ip: h.ip, macAddress: h.macAddress });

    const existingSources = new Set<string>();
    if (dataSourceId) {
      const sources = await prisma.hostSource.findMany({ where: { dataSourceId }, select: { hostFqdn: true } });
      for (const s of sources) existingSources.add(s.hostFqdn);
    }

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

          // Emit host events by comparing with pre-loaded state
          const existing = existingHosts.get(fqdn);
          if (!existing) {
            hostEventService.emit(fqdn, 'host_discovered', { source: 'satellite' });
          } else {
            if (existing.ip && ip && existing.ip !== ip) {
              hostEventService.emit(fqdn, 'ip_changed', { oldIp: existing.ip, newIp: ip });
            }
            if (existing.macAddress && macAddress && existing.macAddress !== macAddress) {
              hostEventService.emit(fqdn, 'mac_changed', { oldMac: existing.macAddress, newMac: macAddress });
            }
          }

          // Upsert host source — rawData and normalizedData are Json fields, pass objects directly
          if (dataSourceId != null) {
            const sourceId = satHost?.hostId ? String(satHost.hostId) : fqdn;
            const rawData = satHost || entry.raw || {};
            const normalizedData = {
              ip: ip || '',
              os: os,
              arch: arch,
              mac: macAddress,
              status: satHost?.registered ? 'registered' : 'unregistered',
              lastCheckin: satHost?.lastCheckin || null,
            };
            await prisma.hostSource.upsert({
              where: {
                hostFqdn_dataSourceId: { hostFqdn: fqdn, dataSourceId },
              },
              update: {
                sourceId,
                rawData,
                normalizedData,
                lastSynced: new Date(),
              },
              create: {
                hostFqdn: fqdn,
                dataSourceId,
                sourceId,
                rawData,
                normalizedData,
                lastSynced: new Date(),
              },
            });

            if (!existingSources.has(fqdn)) {
              hostEventService.emit(fqdn, 'source_added', { source: 'satellite' });
            }
          }

          hostsUpdated++;
        } catch (hostError) {
          const msg = `Error processing Satellite host ${entry.fqdn}: ${(hostError as Error).message}`;
          console.log(`[SysCraft] ${msg}`);
          errors.push(msg);
        }
      }

      const duration = Date.now() - startTime;

      // errors is Json, pass array directly
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length > 0 ? 'partial' : 'success',
          hostsFound,
          hostsUpdated,
          errors,
          completedAt: new Date(),
        },
      });

      // Update DataSource lastSync metadata
      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
          },
        });
      }

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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: { lastSyncAt: new Date(), lastSyncStatus: 'failure' },
        });
      }

      webhookService.fire('source_down', { source: 'satellite', error: (error as Error).message }).catch(() => {});

      console.log(`[SysCraft] Satellite sync failed: ${msg}`);
      return { source: 'satellite', hostsFound, hostsUpdated, errors, duration };
    }
  }

  private async syncCheckmk(dataSourceId?: number): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'checkmk',
        dataSourceId: dataSourceId ?? null,
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Batch load existing hosts for event diffing
    const existingHosts = new Map<string, { ip: string; macAddress: string }>();
    const allHosts = await prisma.host.findMany({ select: { fqdn: true, ip: true, macAddress: true } });
    for (const h of allHosts) existingHosts.set(h.fqdn, { ip: h.ip, macAddress: h.macAddress });

    const existingSources = new Set<string>();
    if (dataSourceId) {
      const sources = await prisma.hostSource.findMany({ where: { dataSourceId }, select: { hostFqdn: true } });
      for (const s of sources) existingSources.add(s.hostFqdn);
    }

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

          // Emit host events by comparing with pre-loaded state
          const existing = existingHosts.get(fqdn);
          if (!existing) {
            hostEventService.emit(fqdn, 'host_discovered', { source: 'checkmk' });
          }

          // Upsert host source — rawData and normalizedData are Json fields, pass objects directly
          if (dataSourceId != null) {
            const serviceCount =
              (cmkHost.services?.ok || 0) +
              (cmkHost.services?.warn || 0) +
              (cmkHost.services?.crit || 0) +
              (cmkHost.services?.unknown || 0) +
              (cmkHost.services?.pending || 0);

            const normalizedData = {
              status: cmkHost.status || 'PENDING',
              agentType: cmkHost.agentType || 'cmk-agent',
              serviceCount,
              lastContact: cmkHost.lastContact || null,
            };
            await prisma.hostSource.upsert({
              where: {
                hostFqdn_dataSourceId: { hostFqdn: fqdn, dataSourceId },
              },
              update: {
                sourceId: fqdn,
                rawData: cmkHost as any,
                normalizedData,
                lastSynced: new Date(),
              },
              create: {
                hostFqdn: fqdn,
                dataSourceId,
                sourceId: fqdn,
                rawData: cmkHost as any,
                normalizedData,
                lastSynced: new Date(),
              },
            });

            if (!existingSources.has(fqdn)) {
              hostEventService.emit(fqdn, 'source_added', { source: 'checkmk' });
            }
          }

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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
          },
        });
      }

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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: { lastSyncAt: new Date(), lastSyncStatus: 'failure' },
        });
      }

      webhookService.fire('source_down', { source: 'checkmk', error: (error as Error).message }).catch(() => {});

      console.log(`[SysCraft] Checkmk sync failed: ${msg}`);
      return { source: 'checkmk', hostsFound, hostsUpdated, errors, duration };
    }
  }

  private async syncDns(dataSourceId?: number): Promise<SyncResult | null> {
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
        dataSourceId: dataSourceId ?? null,
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Batch load existing hosts for event diffing
    const existingHosts = new Map<string, { ip: string; macAddress: string }>();
    const allHosts = await prisma.host.findMany({ select: { fqdn: true, ip: true, macAddress: true } });
    for (const h of allHosts) existingHosts.set(h.fqdn, { ip: h.ip, macAddress: h.macAddress });

    const existingSources = new Set<string>();
    if (dataSourceId) {
      const sources = await prisma.hostSource.findMany({ where: { dataSourceId }, select: { hostFqdn: true } });
      for (const s of sources) existingSources.add(s.hostFqdn);
    }

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
          if (result.forwardIp !== null && dataSourceId != null) {
            // Host has an A record — upsert DNS source
            const normalizedData = {
              forwardIp: result.forwardIp,
              reverseHostname: result.reverseHostname || null,
              forwardMatch: result.forwardMatch,
              reverseMatch: result.reverseMatch,
            };
            await prisma.hostSource.upsert({
              where: {
                hostFqdn_dataSourceId: { hostFqdn: result.fqdn, dataSourceId },
              },
              update: {
                sourceId: result.fqdn,
                rawData: result as any,
                normalizedData,
                lastSynced: new Date(),
              },
              create: {
                hostFqdn: result.fqdn,
                dataSourceId,
                sourceId: result.fqdn,
                rawData: result as any,
                normalizedData,
                lastSynced: new Date(),
              },
            });

            if (!existingSources.has(result.fqdn)) {
              hostEventService.emit(result.fqdn, 'source_added', { source: 'dns' });
            }

            hostsUpdated++;
          } else if (dataSourceId != null) {
            // No A record — remove DNS source if it existed
            if (existingSources.has(result.fqdn)) {
              hostEventService.emit(result.fqdn, 'source_removed', { source: 'dns' });
            }
            await prisma.hostSource.deleteMany({
              where: {
                hostFqdn: result.fqdn,
                dataSourceId,
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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
          },
        });
      }

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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: { lastSyncAt: new Date(), lastSyncStatus: 'failure' },
        });
      }

      webhookService.fire('source_down', { source: 'dns', error: (error as Error).message }).catch(() => {});

      console.log(`[SysCraft] DNS sync failed: ${msg}`);
      return { source: 'dns', hostsFound, hostsUpdated, errors, duration };
    }
  }

  private async syncVcsa(dataSourceId?: number): Promise<SyncResult | null> {
    if (!dataSourceId) return null;

    // Load DataSource record to get config
    const dataSource = await prisma.dataSource.findUnique({ where: { id: dataSourceId } });
    if (!dataSource || !dataSource.enabled) return null;

    const dsConfig = dataSource.config as Record<string, any> | null;
    if (!dsConfig?.url || !dsConfig?.user || !dsConfig?.password) {
      console.log('[SysCraft] vCSA DataSource missing config (url/user/password), skipping');
      return null;
    }

    vcsaService.reconfigure(dsConfig.url, dsConfig.user, dsConfig.password);

    const startTime = Date.now();
    const syncLog = await prisma.syncLog.create({
      data: {
        source: 'vcsa',
        dataSourceId: dataSourceId ?? null,
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Batch load existing hosts for event diffing
    const existingHosts = new Map<string, { ip: string; macAddress: string }>();
    const allHosts = await prisma.host.findMany({ select: { fqdn: true, ip: true, macAddress: true } });
    for (const h of allHosts) existingHosts.set(h.fqdn, { ip: h.ip, macAddress: h.macAddress });

    const existingSources = new Set<string>();
    if (dataSourceId) {
      const sources = await prisma.hostSource.findMany({ where: { dataSourceId }, select: { hostFqdn: true } });
      for (const s of sources) existingSources.add(s.hostFqdn);
    }

    let hostsFound = 0;
    let hostsUpdated = 0;
    const errors: string[] = [];

    try {
      // Fetch all enriched VMs
      const vms = await vcsaService.fetchAllVMsEnriched();
      hostsFound = vms.length;

      // Fetch infrastructure data (ESXi hosts, datastores, networks)
      const [esxiHosts, datastores, networks] = await Promise.all([
        vcsaService.fetchHosts(),
        vcsaService.fetchDatastores(),
        vcsaService.fetchNetworks(),
      ]);

      // Store infrastructure data in settings with VM counts
      const vmPoweredOn = vms.filter((v) => v.powerState === 'POWERED_ON').length;
      const vmPoweredOff = vms.filter((v) => v.powerState === 'POWERED_OFF').length;
      const infraData = { esxiHosts, datastores, networks, vmCount: vms.length, vmPoweredOn, vmPoweredOff };
      await prisma.setting.upsert({
        where: { key: 'vcsa_infrastructure' },
        update: { value: JSON.stringify(infraData) },
        create: { key: 'vcsa_infrastructure', value: JSON.stringify(infraData) },
      });

      // Get dns_zone for FQDN construction
      const dnsZoneSetting = await prisma.setting.findUnique({ where: { key: 'dns_zone' } });
      const dnsZone = dnsZoneSetting?.value || 'ailab.local';

      for (const vm of vms) {
        try {
          // Determine FQDN
          let fqdn: string | null = null;
          const guestHostname = vm.guest.hostname;
          const guestIp = vm.guest.ip;

          if (guestHostname) {
            if (guestHostname.includes('.')) {
              fqdn = guestHostname;
            } else {
              fqdn = `${guestHostname}.${dnsZone}`;
            }
          } else if (!guestIp) {
            // No hostname and no IP — skip this VM entirely
            continue;
          }

          // If no FQDN but has IP, skip host creation (just a temporary identifier)
          if (!fqdn) {
            continue;
          }

          const os = vm.guest.osFullName || '';
          const ip = guestIp || '';
          const mac = vm.nics.length > 0 ? vm.nics[0].mac : '';

          // Upsert host record
          await prisma.host.upsert({
            where: { fqdn },
            update: {
              ip: ip || undefined,
              os: os || undefined,
              macAddress: mac || undefined,
              lastSeen: new Date(),
              updatedAt: new Date(),
            },
            create: {
              fqdn,
              ip: ip || '',
              os,
              arch: '',
              macAddress: mac,
              status: 'new',
              lastSeen: new Date(),
            },
          });

          // Emit host events by comparing with pre-loaded state
          const existing = existingHosts.get(fqdn);
          if (!existing) {
            hostEventService.emit(fqdn, 'host_discovered', { source: 'vcsa' });
          } else {
            if (existing.ip && ip && existing.ip !== ip) {
              hostEventService.emit(fqdn, 'ip_changed', { oldIp: existing.ip, newIp: ip });
            }
            if (existing.macAddress && mac && existing.macAddress !== mac) {
              hostEventService.emit(fqdn, 'mac_changed', { oldMac: existing.macAddress, newMac: mac });
            }
          }

          // Upsert host source — rawData and normalizedData are Json fields, pass objects directly
          const rawData = {
            vmName: vm.vmName,
            vmId: vm.vmId,
            powerState: vm.powerState,
            osFamily: vm.guest.osFamily,
            osFullName: vm.guest.osFullName,
            ip: guestIp,
            mac,
            cpuCount: vm.cpuCount,
            ramMb: vm.ramMb,
          };
          const normalizedData = {
            vmName: vm.vmName,
            vmId: vm.vmId,
            powerState: vm.powerState,
            os: vm.guest.osFullName,
            osFamily: vm.guest.osFamily,
            ip: guestIp,
            mac,
            cpuCount: vm.cpuCount,
            ramMb: vm.ramMb,
            diskGb: 0,
            guestToolsRunning: vm.guest.toolsRunning,
          };

          await prisma.hostSource.upsert({
            where: {
              hostFqdn_dataSourceId: { hostFqdn: fqdn, dataSourceId },
            },
            update: {
              sourceId: vm.vmId,
              rawData,
              normalizedData,
              lastSynced: new Date(),
            },
            create: {
              hostFqdn: fqdn,
              dataSourceId,
              sourceId: vm.vmId,
              rawData,
              normalizedData,
              lastSynced: new Date(),
            },
          });

          if (!existingSources.has(fqdn)) {
            hostEventService.emit(fqdn, 'source_added', { source: 'vcsa' });
          }

          hostsUpdated++;
        } catch (hostError) {
          const msg = `Error processing vCSA VM ${vm.vmName}: ${(hostError as Error).message}`;
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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
          },
        });
      }

      console.log(`[SysCraft] vCSA sync complete: ${hostsFound} found, ${hostsUpdated} updated in ${duration}ms`);

      return { source: 'vcsa', hostsFound, hostsUpdated, errors, duration };
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
          errors,
          completedAt: new Date(),
        },
      });

      if (dataSourceId != null) {
        await prisma.dataSource.update({
          where: { id: dataSourceId },
          data: { lastSyncAt: new Date(), lastSyncStatus: 'failure' },
        });
      }

      webhookService.fire('source_down', { source: 'vcsa', error: (error as Error).message }).catch(() => {});

      console.log(`[SysCraft] vCSA sync failed: ${msg}`);
      return { source: 'vcsa', hostsFound, hostsUpdated, errors, duration };
    }
  }
}

export const schedulerService = new SchedulerService();
