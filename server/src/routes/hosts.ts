import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { satelliteService } from '../services/satellite.js';
import { baselineService } from '../services/baseline.js';
import { isHostAlive } from '../services/ping.js';
import type {
  HostSummary,
  HostDetail,
  HostStatus,
  SourceType,
  OsCategory,
  SatelliteHostData,
  CheckmkHostData,
  DnsHostData,
  PaginatedResponse,
  Recommendation,
  CommandEntry,
} from '../types/index.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/hosts — paginated, filterable host list
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'), 10)));
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    const osCategory = req.query.osCategory ? String(req.query.osCategory) : undefined;
    const sortBy = String(req.query.sortBy || 'fqdn');
    const sortDir = String(req.query.sortDir) === 'desc' ? 'desc' as const : 'asc' as const;

    // Build where clause
    const where: Prisma.HostWhereInput = {};

    // RBAC: non-admin users only see hosts in their assigned host groups
    if (req.user && req.user.role !== 'admin') {
      const userGroups = await prisma.userHostGroup.findMany({
        where: { userId: req.user.id },
        select: { groupId: true },
      });
      const groupIds = userGroups.map((ug) => ug.groupId);
      where.groupMemberships = {
        some: { groupId: { in: groupIds } },
      };
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { fqdn: { contains: search } },
        { ip: { contains: search } },
        { os: { contains: search } },
      ];
    }

    if (source) {
      where.sources = {
        some: { dataSource: { adapter: source } },
      };
    }

    if (osCategory) {
      where.osCategory = osCategory;
    }

    // Build orderBy
    const allowedSortFields = ['fqdn', 'ip', 'os', 'status', 'complianceScore', 'lastSeen', 'createdAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'fqdn';
    const orderBy: Record<string, string> = { [sortField]: sortDir };

    const [hosts, total] = await Promise.all([
      prisma.host.findMany({
        where,
        include: { sources: { include: { dataSource: true } } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.host.count({ where }),
    ]);

    const data: HostSummary[] = hosts.map((host) => {
      const sourceTypes = host.sources.map((s: any) => (s.dataSource as any).adapter as SourceType);

      return {
        fqdn: host.fqdn,
        ip: host.ip,
        os: host.os,
        osCategory: (host as any).osCategory as OsCategory || 'unknown',
        status: host.status as HostStatus,
        satelliteRegistered: sourceTypes.includes('satellite'),
        checkmkMonitored: sourceTypes.includes('checkmk'),
        dnsPresent: sourceTypes.includes('dns'),
        complianceScore: host.complianceScore,
        lastPingSuccess: (host as any).lastPingSuccess ?? false,
        lastSeen: host.lastSeen.toISOString(),
        sources: sourceTypes,
      };
    });

    const response: PaginatedResponse<HostSummary> = {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    res.json(response);
  } catch (error) {
    console.log('[SysCraft] Hosts list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch hosts.' });
  }
});

// GET /api/hosts/:fqdn — full host detail
router.get('/:fqdn', authenticate, async (req: Request, res: Response) => {
  try {
    const fqdn = String(req.params.fqdn);

    // RBAC: non-admin users can only view hosts in their assigned groups
    if (req.user && req.user.role !== 'admin') {
      const userGroups = await prisma.userHostGroup.findMany({
        where: { userId: req.user.id },
        select: { groupId: true },
      });
      const groupIds = userGroups.map((ug) => ug.groupId);
      const membership = await prisma.hostGroupMember.findFirst({
        where: { hostFqdn: fqdn, groupId: { in: groupIds } },
      });
      if (!membership) {
        res.status(403).json({ error: 'You do not have access to this host.' });
        return;
      }
    }

    const host = await prisma.host.findUnique({
      where: { fqdn },
      include: {
        sources: { include: { dataSource: true } },
        agentStatuses: true,
      },
    });

    if (!host) {
      res.status(404).json({ error: `Host "${fqdn}" not found.` });
      return;
    }

    const sourceTypes = host.sources.map((s: any) => (s.dataSource as any).adapter as SourceType);

    // Parse satellite data from source
    let satelliteData: SatelliteHostData | null = null;
    const satSource = host.sources.find((s: any) => (s.dataSource as any).adapter === 'satellite');
    if (satSource) {
      satelliteData = satSource.rawData as unknown as SatelliteHostData;
      if (!satelliteData) {
        // Try to fetch fresh data
        const hostId = satSource.sourceId;
        if (hostId) {
          satelliteData = await satelliteService.fetchHostDetails(hostId);
        }
      }
    }

    // Parse checkmk data from source
    let checkmkData: CheckmkHostData | null = null;
    const cmkSource = host.sources.find((s: any) => (s.dataSource as any).adapter === 'checkmk');
    if (cmkSource) {
      checkmkData = cmkSource.rawData as unknown as CheckmkHostData;
    }

    // Parse DNS data from source
    let dnsData: DnsHostData | null = null;
    const dnsSource = host.sources.find((s: any) => (s.dataSource as any).adapter === 'dns');
    if (dnsSource) {
      dnsData = dnsSource.rawData as unknown as DnsHostData;
    }

    // Get agent compliance
    const agents = await baselineService.checkCompliance(fqdn);

    // Get liveness
    const cleanupSetting = await prisma.setting.findUnique({ where: { key: 'cleanup_threshold_days' } });
    const cleanupDays = parseInt(cleanupSetting?.value || '7', 10);
    const liveness = isHostAlive(
      {
        fqdn: host.fqdn,
        lastPingAt: (host as any).lastPingAt,
        lastPingSuccess: (host as any).lastPingSuccess ?? false,
        sources: host.sources.map((s: any) => ({
          source: (s.dataSource as any).adapter,
          rawData: s.rawData,
          lastSynced: s.lastSynced,
        })),
      },
      cleanupDays
    );

    // Get recommendations
    const recs = await prisma.recommendation.findMany({
      where: { hostFqdn: fqdn, status: 'open' },
      orderBy: { severity: 'asc' },
    });
    const recommendations: Recommendation[] = recs.map((r) => ({
      id: r.id,
      hostFqdn: r.hostFqdn,
      type: r.type as any,
      severity: r.severity,
      description: r.description,
      systemTarget: r.systemTarget,
      commands: (r.commands || []) as unknown as CommandEntry[],
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const detail: HostDetail = {
      fqdn: host.fqdn,
      ip: host.ip,
      os: host.os,
      osCategory: ((host as any).osCategory || 'unknown') as OsCategory,
      arch: host.arch,
      macAddress: (host as any).macAddress || '',
      lastPingAt: (host as any).lastPingAt?.toISOString() ?? null,
      lastPingSuccess: (host as any).lastPingSuccess ?? false,
      status: host.status as HostStatus,
      satelliteRegistered: sourceTypes.includes('satellite'),
      checkmkMonitored: sourceTypes.includes('checkmk'),
      dnsPresent: sourceTypes.includes('dns'),
      complianceScore: host.complianceScore,
      lastSeen: host.lastSeen.toISOString(),
      sources: sourceTypes,
      satellite: satelliteData,
      checkmk: checkmkData,
      dns: dnsData,
      agents,
      liveness,
      recommendations,
    };

    res.json(detail);
  } catch (error) {
    console.log('[SysCraft] Host detail error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch host details.' });
  }
});

// PUT /api/hosts/:fqdn/status — update host status (admin only)
router.put(
  '/:fqdn/status',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const fqdn = String(req.params.fqdn);
      const { status } = req.body;

      const validStatuses: HostStatus[] = ['active', 'partial', 'stale', 'new', 'decommissioning'];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
        return;
      }

      const host = await prisma.host.findUnique({ where: { fqdn } });
      if (!host) {
        res.status(404).json({ error: `Host "${fqdn}" not found.` });
        return;
      }

      const previousStatus = host.status;

      const updated = await prisma.host.update({
        where: { fqdn },
        data: { status },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_status_changed',
          target: fqdn,
          details: {
            previousStatus,
            newStatus: status,
            changedBy: req.user!.username,
          },
        },
      });

      console.log(`[SysCraft] Host "${fqdn}" status changed: ${previousStatus} -> ${status} by ${req.user!.username}`);

      res.json({
        message: `Host status updated to "${status}".`,
        host: {
          fqdn: updated.fqdn,
          status: updated.status,
        },
      });
    } catch (error) {
      console.log('[SysCraft] Host status update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update host status.' });
    }
  }
);

// PUT /api/hosts/:fqdn/os-category — manually set OS category (admin only)
router.put(
  '/:fqdn/os-category',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const fqdn = String(req.params.fqdn);
      const { osCategory } = req.body;

      const validCategories: OsCategory[] = ['linux', 'windows', 'appliance', 'unknown'];
      if (!osCategory || !validCategories.includes(osCategory)) {
        res.status(400).json({
          error: `Invalid OS category. Must be one of: ${validCategories.join(', ')}`,
        });
        return;
      }

      const host = await prisma.host.findUnique({ where: { fqdn } });
      if (!host) {
        res.status(404).json({ error: `Host "${fqdn}" not found.` });
        return;
      }

      await prisma.host.update({
        where: { fqdn },
        data: { osCategory },
      });

      // Auto-resolve classify_os recommendations
      await prisma.recommendation.updateMany({
        where: { hostFqdn: fqdn, type: 'classify_os', status: 'open' },
        data: { status: 'resolved' },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'os_category_set',
          target: fqdn,
          details: { osCategory, changedBy: req.user!.username },
        },
      });

      res.json({ message: `OS category set to "${osCategory}".`, fqdn, osCategory });
    } catch (error) {
      console.log('[SysCraft] OS category update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update OS category.' });
    }
  }
);

// GET /api/hosts/:fqdn/agents — get agent compliance for a host
router.get('/:fqdn/agents', authenticate, async (req: Request, res: Response) => {
  try {
    const fqdn = String(req.params.fqdn);

    const host = await prisma.host.findUnique({ where: { fqdn } });
    if (!host) {
      res.status(404).json({ error: `Host "${fqdn}" not found.` });
      return;
    }

    const agents = await baselineService.checkCompliance(fqdn);

    res.json({
      fqdn,
      complianceScore: baselineService.calculateComplianceScore(agents),
      agents,
    });
  } catch (error) {
    console.log('[SysCraft] Host agents error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch agent compliance.' });
  }
});

export default router;
