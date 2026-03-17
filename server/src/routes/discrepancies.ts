import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { reconcilerService } from '../services/reconciler.js';

const router = Router();

// GET /api/discrepancies
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;

    const discrepancies = await reconcilerService.getDiscrepancies({
      type,
      severity,
    });

    res.json({
      data: discrepancies,
      total: discrepancies.length,
      filters: {
        type: type || null,
        severity: severity || null,
      },
    });
  } catch (error) {
    console.log('[SysCraft] Discrepancies error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch discrepancies.' });
  }
});

export default router;
