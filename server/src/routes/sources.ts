import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { satelliteService } from '../services/satellite.js';
import { checkmkService } from '../services/checkmk.js';
import { dnsService } from '../services/dns.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/sources — list all data sources
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const sources = await prisma.dataSource.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { hostSources: true, syncLogs: true } },
      },
    });

    const data = sources.map((s) => {
      const config = s.config as Record<string, any>;
      // Mask passwords in response
      const safeConfig = { ...config };
      for (const key of Object.keys(safeConfig)) {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
          safeConfig[key] = '••••••••';
        }
      }
      return {
        id: s.id,
        name: s.name,
        adapter: s.adapter,
        config: safeConfig,
        enabled: s.enabled,
        syncIntervalMin: s.syncIntervalMin,
        capabilities: s.capabilities,
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: s.lastSyncStatus,
        hostCount: s._count.hostSources,
        syncCount: s._count.syncLogs,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    res.json({ data, total: data.length });
  } catch (error) {
    console.log('[SysCraft] Sources list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch data sources.' });
  }
});

// GET /api/sources/:id — get single source
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) {
      res.status(404).json({ error: 'Data source not found.' });
      return;
    }
    const config = source.config as Record<string, any>;
    const safeConfig = { ...config };
    for (const key of Object.keys(safeConfig)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        safeConfig[key] = '••••••••';
      }
    }
    res.json({ ...source, config: safeConfig, createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString() });
  } catch (error) {
    console.log('[SysCraft] Source get error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch data source.' });
  }
});

// POST /api/sources — create a new data source (admin)
router.post('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { name, adapter, config, enabled, syncIntervalMin, capabilities } = req.body;

    if (!name || !adapter) {
      res.status(400).json({ error: 'Name and adapter are required.' });
      return;
    }

    const validAdapters = ['satellite', 'checkmk', 'dns', 'vcsa', 'netbox', 'custom'];
    if (!validAdapters.includes(adapter)) {
      res.status(400).json({ error: `Invalid adapter. Must be one of: ${validAdapters.join(', ')}` });
      return;
    }

    const source = await prisma.dataSource.create({
      data: {
        name,
        adapter,
        config: config || {},
        enabled: enabled ?? true,
        syncIntervalMin: syncIntervalMin || 15,
        capabilities: capabilities || [],
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'data_source_created',
        target: name,
        details: { adapter, enabled: enabled ?? true },
      },
    });

    res.status(201).json(source);
  } catch (error) {
    console.log('[SysCraft] Source create error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to create data source.' });
  }
});

// PUT /api/sources/:id — update data source (admin)
router.put('/:id', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { name, config, enabled, syncIntervalMin, capabilities } = req.body;

    const existing = await prisma.dataSource.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Data source not found.' });
      return;
    }

    // Merge config — don't overwrite passwords with masked values
    let mergedConfig = config;
    if (config && existing.config) {
      const existingConfig = existing.config as Record<string, any>;
      mergedConfig = { ...existingConfig, ...config };
      // Restore masked passwords
      for (const key of Object.keys(mergedConfig)) {
        if (mergedConfig[key] === '••••••••') {
          mergedConfig[key] = existingConfig[key];
        }
      }
    }

    const source = await prisma.dataSource.update({
      where: { id },
      data: {
        name: name || undefined,
        config: mergedConfig || undefined,
        enabled: enabled !== undefined ? enabled : undefined,
        syncIntervalMin: syncIntervalMin || undefined,
        capabilities: capabilities || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'data_source_updated',
        target: source.name,
        details: { id, changes: Object.keys(req.body) },
      },
    });

    res.json(source);
  } catch (error) {
    console.log('[SysCraft] Source update error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to update data source.' });
  }
});

// DELETE /api/sources/:id — delete data source (admin)
router.delete('/:id', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) {
      res.status(404).json({ error: 'Data source not found.' });
      return;
    }

    await prisma.dataSource.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'data_source_deleted',
        target: source.name,
        details: { id, adapter: source.adapter },
      },
    });

    res.json({ message: `Data source "${source.name}" deleted.` });
  } catch (error) {
    console.log('[SysCraft] Source delete error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to delete data source.' });
  }
});

// POST /api/sources/:id/test — test connection (admin)
router.post('/:id/test', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) {
      res.status(404).json({ error: 'Data source not found.' });
      return;
    }

    const config = source.config as Record<string, any>;
    let connected = false;
    let error: string | null = null;

    switch (source.adapter) {
      case 'satellite':
        try {
          satelliteService.reconfigure(config.url, config.user, config.password);
          connected = await satelliteService.testConnection();
        } catch (e) { error = (e as Error).message; }
        break;
      case 'checkmk':
        try {
          checkmkService.reconfigure(config.url, config.user, config.password);
          connected = await checkmkService.testConnection();
        } catch (e) { error = (e as Error).message; }
        break;
      case 'dns':
        try {
          dnsService.reconfigure(config.server, config.port || 53, config.zone || '');
          connected = await dnsService.testConnection();
        } catch (e) { error = (e as Error).message; }
        break;
      default:
        error = `No test handler for adapter "${source.adapter}"`;
    }

    res.json({ connected, error, adapter: source.adapter, name: source.name });
  } catch (error) {
    console.log('[SysCraft] Source test error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to test data source connection.' });
  }
});

export default router;
