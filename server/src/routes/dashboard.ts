import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { satelliteService } from '../services/satellite.js';
import { checkmkService } from '../services/checkmk.js';
import { dnsService } from '../services/dns.js';
import type { DashboardData, SystemStatus, AuditEvent } from '../types/index.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    // Host counts by status
    const [totalHosts, activeHosts, partialHosts, staleHosts, newHosts] = await Promise.all([
      prisma.host.count(),
      prisma.host.count({ where: { status: 'active' } }),
      prisma.host.count({ where: { status: 'partial' } }),
      prisma.host.count({ where: { status: 'stale' } }),
      prisma.host.count({ where: { status: 'new' } }),
    ]);

    // Average compliance score
    const complianceResult = await prisma.host.aggregate({
      _avg: { complianceScore: true },
    });
    const complianceAverage = Math.round(complianceResult._avg.complianceScore || 0);

    // Host compliance breakdown: hosts in both systems vs partial vs neither
    const allHosts = await prisma.host.findMany({
      include: { sources: { select: { source: true } } },
    });
    let hostsBothSystems = 0;
    let hostsOnlyOne = 0;
    let hostsNoSystem = 0;
    for (const h of allHosts) {
      const srcs = new Set(h.sources.map((s: { source: string }) => s.source));
      const hasSat = srcs.has('satellite');
      const hasCmk = srcs.has('checkmk');
      if (hasSat && hasCmk) hostsBothSystems++;
      else if (hasSat || hasCmk) hostsOnlyOne++;
      else hostsNoSystem++;
    }

    // Agent compliance breakdown: across all hosts, how many agents installed vs absent
    const agentStatuses = await prisma.agentStatus.findMany();
    let agentsInstalled = 0;
    let agentsAbsent = 0;
    for (const a of agentStatuses) {
      if (a.installed) agentsInstalled++;
      else agentsAbsent++;
    }
    const agentCompliancePercent = (agentsInstalled + agentsAbsent) > 0
      ? Math.round((agentsInstalled / (agentsInstalled + agentsAbsent)) * 100)
      : 0;
    const hostCompliancePercent = totalHosts > 0
      ? Math.round((hostsBothSystems / totalHosts) * 100)
      : 0;

    // System statuses
    const systemStatuses = await getSystemStatuses();

    // Recent audit events
    const recentAuditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { username: true } } },
    });

    const recentEvents: AuditEvent[] = recentAuditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      target: log.target,
      details: JSON.parse(log.details || '{}'),
      createdAt: log.createdAt.toISOString(),
      username: log.user?.username || null,
    }));

    // Discrepancy count — count hosts that are partial or stale
    const discrepancyCount = partialHosts + staleHosts;

    // Recommendation summary from DB
    const openRecs = await prisma.recommendation.findMany({
      where: { status: 'open' },
      select: { severity: true },
    });
    const recSummary = { total: openRecs.length, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const r of openRecs) {
      if (r.severity in recSummary) {
        (recSummary as any)[r.severity]++;
      }
    }

    // OS category breakdown
    const hostsByOsCategory = { linux: 0, windows: 0, appliance: 0, unknown: 0 };
    for (const h of allHosts) {
      const cat = (h as any).osCategory || 'unknown';
      if (cat in hostsByOsCategory) {
        (hostsByOsCategory as any)[cat]++;
      }
    }

    const dashboard: DashboardData = {
      totalHosts,
      activeHosts,
      partialHosts,
      staleHosts,
      newHosts,
      complianceAverage,
      systemStatuses,
      recentEvents,
      discrepancyCount,
      recommendationSummary: recSummary,
      hostsByOsCategory,
      hostCompliance: {
        bothSystems: hostsBothSystems,
        onlyOne: hostsOnlyOne,
        none: hostsNoSystem,
        percent: hostCompliancePercent,
      },
      agentCompliance: {
        installed: agentsInstalled,
        absent: agentsAbsent,
        percent: agentCompliancePercent,
      },
    };

    res.json(dashboard);
  } catch (error) {
    console.log('[SysCraft] Dashboard error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

async function getSystemStatuses(): Promise<SystemStatus[]> {
  const statuses: SystemStatus[] = [];

  // Satellite status
  const satLastSync = await prisma.syncLog.findFirst({
    where: { source: 'satellite' },
    orderBy: { startedAt: 'desc' },
  });

  let satConnected = false;
  let satError: string | null = null;
  let satHostCount = 0;

  try {
    satConnected = await satelliteService.testConnection();
    if (satConnected) {
      satHostCount = await satelliteService.getHostCount();
    }
  } catch (err) {
    satError = (err as Error).message;
  }

  statuses.push({
    name: 'Red Hat Satellite',
    type: 'satellite',
    connected: satConnected,
    lastSync: satLastSync?.completedAt?.toISOString() || satLastSync?.startedAt?.toISOString() || null,
    hostCount: satHostCount,
    error: satConnected ? null : (satError || 'Connection failed'),
  });

  // Checkmk status
  const cmkLastSync = await prisma.syncLog.findFirst({
    where: { source: 'checkmk' },
    orderBy: { startedAt: 'desc' },
  });

  let cmkConnected = false;
  let cmkError: string | null = null;
  let cmkHostCount = 0;

  try {
    cmkConnected = await checkmkService.testConnection();
    if (cmkConnected) {
      cmkHostCount = await checkmkService.getHostCount();
    }
  } catch (err) {
    cmkError = (err as Error).message;
  }

  statuses.push({
    name: 'Checkmk',
    type: 'checkmk',
    connected: cmkConnected,
    lastSync: cmkLastSync?.completedAt?.toISOString() || cmkLastSync?.startedAt?.toISOString() || null,
    hostCount: cmkHostCount,
    error: cmkConnected ? null : (cmkError || 'Connection failed'),
  });

  // DNS status (only if enabled)
  const dnsEnabledSetting = await prisma.setting.findUnique({ where: { key: 'dns_enabled' } });
  if (dnsEnabledSetting?.value === 'true') {
    const dnsLastSync = await prisma.syncLog.findFirst({
      where: { source: 'dns' },
      orderBy: { startedAt: 'desc' },
    });

    let dnsConnected = false;
    let dnsError: string | null = null;
    let dnsHostCount = 0;

    try {
      // Reconfigure from DB settings before testing
      const dnsSettings = await prisma.setting.findMany({
        where: { key: { startsWith: 'dns_' } },
      });
      const dnsMap = new Map(dnsSettings.map((s) => [s.key, s.value]));
      dnsService.reconfigure(
        dnsMap.get('dns_server') || '127.0.0.1',
        parseInt(dnsMap.get('dns_port') || '53', 10),
        dnsMap.get('dns_zone') || 'ailab.local',
      );

      dnsConnected = await dnsService.testConnection();
      if (dnsConnected) {
        dnsHostCount = await prisma.hostSource.count({ where: { source: 'dns' } });
      }
    } catch (err) {
      dnsError = (err as Error).message;
    }

    statuses.push({
      name: 'DNS Server',
      type: 'dns',
      connected: dnsConnected,
      lastSync: dnsLastSync?.completedAt?.toISOString() || dnsLastSync?.startedAt?.toISOString() || null,
      hostCount: dnsHostCount,
      error: dnsConnected ? null : (dnsError || 'Connection failed'),
    });
  }

  return statuses;
}

export default router;
