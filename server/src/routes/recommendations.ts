import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import type { CommandEntry, Recommendation } from '../types/index.js';

const router = Router();
const prisma = new PrismaClient();

function parseRec(rec: any): Recommendation {
  return {
    id: rec.id,
    hostFqdn: rec.hostFqdn,
    type: rec.type,
    severity: rec.severity,
    description: rec.description,
    systemTarget: rec.systemTarget,
    commands: (rec.commands || []) as any,
    status: rec.status,
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
  };
}

// GET /api/recommendations — list open recommendations
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10)));
    const type = req.query.type ? String(req.query.type) : undefined;
    const severity = req.query.severity ? String(req.query.severity) : undefined;
    const system = req.query.system ? String(req.query.system) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const status = req.query.status ? String(req.query.status) : 'open';

    const where: Prisma.RecommendationWhereInput = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (system) where.systemTarget = system;
    if (search) {
      where.OR = [
        { hostFqdn: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [recs, total] = await Promise.all([
      prisma.recommendation.findMany({
        where,
        orderBy: [
          { severity: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.recommendation.count({ where }),
    ]);

    res.json({
      data: recs.map(parseRec),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.log('[SysCraft] Recommendations list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch recommendations.' });
  }
});

// GET /api/recommendations/summary — counts by severity, type, system
router.get('/summary', authenticate, async (_req: Request, res: Response) => {
  try {
    const openRecs = await prisma.recommendation.findMany({
      where: { status: 'open' },
      select: { severity: true, type: true, systemTarget: true },
    });

    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byType: Record<string, number> = {};
    const bySystem: Record<string, number> = {};

    for (const r of openRecs) {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
      bySystem[r.systemTarget] = (bySystem[r.systemTarget] || 0) + 1;
    }

    res.json({
      total: openRecs.length,
      bySeverity,
      byType,
      bySystem,
    });
  } catch (error) {
    console.log('[SysCraft] Recommendations summary error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch recommendation summary.' });
  }
});

// GET /api/recommendations/by-host/:fqdn — all recs for one host
router.get('/by-host/:fqdn', authenticate, async (req: Request, res: Response) => {
  try {
    const fqdn = String(req.params.fqdn);
    const recs = await prisma.recommendation.findMany({
      where: { hostFqdn: fqdn, status: 'open' },
      orderBy: { severity: 'asc' },
    });
    res.json({ data: recs.map(parseRec) });
  } catch (error) {
    console.log('[SysCraft] Recommendations by-host error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch host recommendations.' });
  }
});

// GET /api/recommendations/by-system/:system — all recs for one system
router.get('/by-system/:system', authenticate, async (req: Request, res: Response) => {
  try {
    const system = String(req.params.system);
    const recs = await prisma.recommendation.findMany({
      where: { systemTarget: system, status: 'open' },
      orderBy: [{ severity: 'asc' }, { hostFqdn: 'asc' }],
    });
    res.json({ data: recs.map(parseRec) });
  } catch (error) {
    console.log('[SysCraft] Recommendations by-system error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch system recommendations.' });
  }
});

// GET /api/recommendations/commands/:system — combined script for one system
router.get('/commands/:system', authenticate, async (req: Request, res: Response) => {
  try {
    const system = String(req.params.system);
    const recs = await prisma.recommendation.findMany({
      where: { systemTarget: system, status: 'open' },
      orderBy: { hostFqdn: 'asc' },
    });

    const lines: string[] = [
      `#!/bin/bash`,
      `# SysCraft — Combined commands for ${system}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Recommendations: ${recs.length}`,
      '',
    ];

    for (const rec of recs) {
      const commands: CommandEntry[] = (rec.commands || []) as unknown as CommandEntry[];
      lines.push(`# --- ${rec.hostFqdn}: ${rec.type} (${rec.severity}) ---`);
      for (const cmd of commands) {
        lines.push(`# ${cmd.label}`);
        lines.push(cmd.command);
        lines.push('');
      }
    }

    res.type('text/plain').send(lines.join('\n'));
  } catch (error) {
    console.log('[SysCraft] Recommendations commands error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to generate commands.' });
  }
});

// PUT /api/recommendations/:id/dismiss — mark as dismissed (admin)
router.put('/:id/dismiss', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const rec = await prisma.recommendation.update({
      where: { id },
      data: { status: 'dismissed' },
    });
    res.json(parseRec(rec));
  } catch (error) {
    console.log('[SysCraft] Recommendation dismiss error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to dismiss recommendation.' });
  }
});

// PUT /api/recommendations/:id/resolve — mark as resolved (admin)
router.put('/:id/resolve', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const rec = await prisma.recommendation.update({
      where: { id },
      data: { status: 'resolved' },
    });
    res.json(parseRec(rec));
  } catch (error) {
    console.log('[SysCraft] Recommendation resolve error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to resolve recommendation.' });
  }
});

export default router;
