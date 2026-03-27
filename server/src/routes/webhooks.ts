import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { webhookService } from '../services/webhook.js';

const router = Router();
const prisma = new PrismaClient();

const VALID_EVENTS = [
  'recommendation_critical', 'recommendation_high', 'source_down',
  'host_stale', 'host_discovered', 'liveness_changed',
  'sync_completed', 'daily_summary',
];

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 4) return '****';
  return '****' + secret.slice(-4);
}

// GET /api/webhooks — list all webhooks
router.get('/', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { logs: true } } },
    });

    res.json({
      data: webhooks.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        secret: maskSecret(w.secret),
        enabled: w.enabled,
        events: w.events,
        headers: w.headers,
        method: w.method,
        bodyTemplate: w.bodyTemplate,
        retryCount: w.retryCount,
        retryDelayMs: w.retryDelayMs,
        lastFiredAt: w.lastFiredAt?.toISOString() ?? null,
        lastStatus: w.lastStatus,
        logCount: w._count.logs,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.log('[SysCraft] Webhooks list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch webhooks.' });
  }
});

// POST /api/webhooks — create webhook
router.post('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { name, url, secret, enabled, events, headers, method, bodyTemplate, retryCount, retryDelayMs } = req.body;

    if (!name || !url) {
      res.status(400).json({ error: 'Name and URL are required.' });
      return;
    }

    if (events && !events.every((e: string) => VALID_EVENTS.includes(e))) {
      res.status(400).json({ error: `Invalid event(s). Valid: ${VALID_EVENTS.join(', ')}` });
      return;
    }

    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        secret: secret || '',
        enabled: enabled ?? true,
        events: events || [],
        headers: headers || {},
        method: method || 'POST',
        bodyTemplate: bodyTemplate || '',
        retryCount: retryCount ?? 3,
        retryDelayMs: retryDelayMs ?? 5000,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'webhook_created',
        target: name,
        details: { id: webhook.id, url, events },
      },
    });

    res.status(201).json(webhook);
  } catch (error) {
    console.log('[SysCraft] Webhook create error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to create webhook.' });
  }
});

// PUT /api/webhooks/:id — update webhook
router.put('/:id', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { name, url, secret, enabled, events, headers, method, bodyTemplate, retryCount, retryDelayMs } = req.body;

    const existing = await prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Webhook not found.' });
      return;
    }

    // Skip secret update if masked
    const actualSecret = secret && !/^\*+/.test(secret) ? secret : undefined;

    const webhook = await prisma.webhook.update({
      where: { id },
      data: {
        name: name || undefined,
        url: url || undefined,
        secret: actualSecret,
        enabled: enabled !== undefined ? enabled : undefined,
        events: events || undefined,
        headers: headers || undefined,
        method: method || undefined,
        bodyTemplate: bodyTemplate !== undefined ? bodyTemplate : undefined,
        retryCount: retryCount !== undefined ? retryCount : undefined,
        retryDelayMs: retryDelayMs !== undefined ? retryDelayMs : undefined,
      },
    });

    res.json(webhook);
  } catch (error) {
    console.log('[SysCraft] Webhook update error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to update webhook.' });
  }
});

// DELETE /api/webhooks/:id — delete webhook + logs
router.delete('/:id', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await prisma.webhook.delete({ where: { id } });
    res.json({ message: 'Webhook deleted.' });
  } catch (error) {
    console.log('[SysCraft] Webhook delete error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to delete webhook.' });
  }
});

// POST /api/webhooks/:id/test — send test payload
router.post('/:id/test', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found.' });
      return;
    }

    const result = await webhookService.fireOne(webhook, 'test', {
      message: 'This is a test webhook from SysCraft.',
      timestamp: new Date().toISOString(),
    });

    res.json(result);
  } catch (error) {
    console.log('[SysCraft] Webhook test error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to test webhook.' });
  }
});

// GET /api/webhooks/:id/logs — delivery history
router.get('/:id/logs', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)));

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where: { webhookId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.webhookLog.count({ where: { webhookId: id } }),
    ]);

    res.json({
      data: logs.map((l) => ({
        id: l.id,
        webhookId: l.webhookId,
        event: l.event,
        payload: l.payload,
        statusCode: l.statusCode,
        response: l.response,
        success: l.success,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.log('[SysCraft] Webhook logs error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch webhook logs.' });
  }
});

export default router;
