import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/timeline/recent — global recent events
router.get('/recent', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const events = await prisma.hostEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({
      data: events.map((e) => ({
        id: e.id,
        hostFqdn: e.hostFqdn,
        event: e.event,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.log('[SysCraft] Timeline recent error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch recent events.' });
  }
});

export default router;
