import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { schedulerService } from '../services/scheduler.js';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/sync — trigger manual sync (admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      if (schedulerService.isRunning()) {
        res.status(409).json({
          error: 'A sync is already in progress. Please wait for it to complete.',
        });
        return;
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'manual_sync_triggered',
          target: 'system',
          details: { triggeredBy: req.user!.username },
        },
      });

      console.log(`[SysCraft] Manual sync triggered by ${req.user!.username}`);

      // Start sync in background so we can respond immediately
      const syncPromise = schedulerService.runSync();

      // Respond that sync has started
      res.json({
        message: 'Sync started. Check /api/sync/status for progress.',
        startedAt: new Date().toISOString(),
        triggeredBy: req.user!.username,
      });

      // Wait for completion and log result
      syncPromise
        .then((results) => {
          console.log('[SysCraft] Manual sync completed:', JSON.stringify(results.map((r) => ({
            source: r.source,
            hostsFound: r.hostsFound,
            hostsUpdated: r.hostsUpdated,
            duration: r.duration,
          }))));
        })
        .catch((err) => {
          console.log('[SysCraft] Manual sync error:', err.message);
        });
    } catch (error) {
      console.log('[SysCraft] Sync trigger error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to start sync.' });
    }
  }
);

// GET /api/sync/status — return sync status and last sync info
router.get('/status', authenticate, async (_req: Request, res: Response) => {
  try {
    const { lastSync, isRunning } = await schedulerService.getLastSync();

    res.json({
      isRunning,
      lastSync: lastSync
        ? {
            id: lastSync.id,
            source: lastSync.source,
            status: lastSync.status,
            hostsFound: lastSync.hostsFound,
            hostsUpdated: lastSync.hostsUpdated,
            errors: (lastSync.errors || []) as any,
            startedAt: lastSync.startedAt.toISOString(),
            completedAt: lastSync.completedAt?.toISOString() || null,
          }
        : null,
    });
  } catch (error) {
    console.log('[SysCraft] Sync status error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch sync status.' });
  }
});

// GET /api/sync/history — return recent sync logs
router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const logs = await schedulerService.getSyncHistory(limit);

    const data = logs.map((log) => ({
      id: log.id,
      source: log.source,
      status: log.status,
      hostsFound: log.hostsFound,
      hostsUpdated: log.hostsUpdated,
      errors: (log.errors || []) as any,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString() || null,
    }));

    res.json({ data, total: data.length });
  } catch (error) {
    console.log('[SysCraft] Sync history error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch sync history.' });
  }
});

export default router;
