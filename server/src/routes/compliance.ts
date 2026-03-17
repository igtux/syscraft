import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { baselineService } from '../services/baseline.js';

const router = Router();

// GET /api/compliance — compliance matrix
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const matrix = await baselineService.getComplianceMatrix();
    res.json({
      data: matrix,
      total: matrix.length,
    });
  } catch (error) {
    console.log('[SysCraft] Compliance matrix error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch compliance matrix.' });
  }
});

// GET /api/compliance/baselines — configured baselines
router.get('/baselines', authenticate, async (_req: Request, res: Response) => {
  try {
    const baselines = await baselineService.getBaselines();

    const parsed = baselines.map((b) => ({
      id: b.id,
      name: b.name,
      packageName: b.packageName,
      description: b.description,
      requiredForGroups: JSON.parse(b.requiredForGroups || '["all"]'),
      enabled: b.enabled,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));

    res.json({ data: parsed });
  } catch (error) {
    console.log('[SysCraft] Baselines list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch baselines.' });
  }
});

// POST /api/compliance/baselines — add new baseline (admin only)
router.post(
  '/baselines',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const { name, packageName, description, requiredForGroups, enabled } = req.body;

      if (!name || !packageName) {
        res.status(400).json({ error: 'Name and packageName are required.' });
        return;
      }

      const baseline = await baselineService.createBaseline({
        name,
        packageName,
        description,
        requiredForGroups,
        enabled,
      });

      console.log(`[SysCraft] Baseline created: "${name}" (${packageName})`);

      res.status(201).json({
        id: baseline.id,
        name: baseline.name,
        packageName: baseline.packageName,
        description: baseline.description,
        requiredForGroups: JSON.parse(baseline.requiredForGroups || '["all"]'),
        enabled: baseline.enabled,
        createdAt: baseline.createdAt.toISOString(),
        updatedAt: baseline.updatedAt.toISOString(),
      });
    } catch (error) {
      console.log('[SysCraft] Baseline create error:', (error as Error).message);
      if ((error as any).code === 'P2002') {
        res.status(409).json({ error: 'A baseline with that name already exists.' });
        return;
      }
      res.status(500).json({ error: 'Failed to create baseline.' });
    }
  }
);

// PUT /api/compliance/baselines/:id — update baseline
router.put(
  '/baselines/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid baseline ID.' });
        return;
      }

      const { name, packageName, description, requiredForGroups, enabled } = req.body;

      const baseline = await baselineService.updateBaseline(id, {
        name,
        packageName,
        description,
        requiredForGroups,
        enabled,
      });

      console.log(`[SysCraft] Baseline updated: ID ${id}`);

      res.json({
        id: baseline.id,
        name: baseline.name,
        packageName: baseline.packageName,
        description: baseline.description,
        requiredForGroups: JSON.parse(baseline.requiredForGroups || '["all"]'),
        enabled: baseline.enabled,
        createdAt: baseline.createdAt.toISOString(),
        updatedAt: baseline.updatedAt.toISOString(),
      });
    } catch (error) {
      console.log('[SysCraft] Baseline update error:', (error as Error).message);
      if ((error as any).code === 'P2025') {
        res.status(404).json({ error: 'Baseline not found.' });
        return;
      }
      res.status(500).json({ error: 'Failed to update baseline.' });
    }
  }
);

// DELETE /api/compliance/baselines/:id — delete baseline
router.delete(
  '/baselines/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid baseline ID.' });
        return;
      }

      await baselineService.deleteBaseline(id);
      console.log(`[SysCraft] Baseline deleted: ID ${id}`);

      res.json({ message: 'Baseline deleted successfully.' });
    } catch (error) {
      console.log('[SysCraft] Baseline delete error:', (error as Error).message);
      if ((error as any).code === 'P2025') {
        res.status(404).json({ error: 'Baseline not found.' });
        return;
      }
      res.status(500).json({ error: 'Failed to delete baseline.' });
    }
  }
);

export default router;
