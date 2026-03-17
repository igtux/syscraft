import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { satelliteService } from '../services/satellite.js';
import { checkmkService } from '../services/checkmk.js';
import { dnsService } from '../services/dns.js';

const router = Router();
const prisma = new PrismaClient();

const SENSITIVE_KEYS = new Set([
  'satellite_password',
  'checkmk_password',
]);

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(key) && value) {
    return '*'.repeat(Math.min(value.length, 20));
  }
  return value;
}

// GET /api/settings — return all settings (admin only)
router.get(
  '/',
  authenticate,
  authorize('admin'),
  async (_req: Request, res: Response) => {
    try {
      const settings = await prisma.setting.findMany({
        orderBy: { key: 'asc' },
      });

      const data = settings.map((s) => ({
        id: s.id,
        key: s.key,
        value: maskValue(s.key, s.value),
        description: s.description,
      }));

      res.json({ data });
    } catch (error) {
      console.log('[SysCraft] Settings list error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to fetch settings.' });
    }
  }
);

// PUT /api/settings — update settings (admin only)
router.put(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const body = req.body;
      let updates: Array<{ key: string; value: string }> = [];

      if (Array.isArray(body)) {
        updates = body.map((item: any) => ({
          key: String(item.key),
          value: String(item.value),
        }));
      } else if (typeof body === 'object' && body !== null) {
        if (Array.isArray(body.settings)) {
          updates = body.settings.map((item: any) => ({
            key: String(item.key),
            value: String(item.value),
          }));
        } else {
          for (const [key, value] of Object.entries(body)) {
            if (key !== 'settings') {
              updates.push({ key, value: String(value) });
            }
          }
        }
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No settings provided.' });
        return;
      }

      // Skip masked password values (unchanged)
      updates = updates.filter((u) => {
        if (SENSITIVE_KEYS.has(u.key) && /^\*+$/.test(u.value)) {
          return false;
        }
        return true;
      });

      const results = [];

      for (const { key, value } of updates) {
        const setting = await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value, description: '' },
        });
        results.push({
          id: setting.id,
          key: setting.key,
          value: maskValue(setting.key, setting.value),
          description: setting.description,
        });
      }

      // Reconfigure services if credentials changed
      await reconfigureServices();

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'settings_updated',
          target: 'settings',
          details: {
            updatedKeys: updates.map((u) => u.key),
            changedBy: req.user!.username,
          },
        },
      });

      console.log(`[SysCraft] Settings updated by ${req.user!.username}: ${updates.map((u) => u.key).join(', ')}`);

      res.json({
        message: `${results.length} setting(s) updated.`,
        data: results,
      });
    } catch (error) {
      console.log('[SysCraft] Settings update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update settings.' });
    }
  }
);

async function reconfigureServices(): Promise<void> {
  try {
    const settings = await prisma.setting.findMany();
    const map = new Map(settings.map((s) => [s.key, s.value]));

    const satUrl = map.get('satellite_url');
    const satUser = map.get('satellite_user');
    const satPass = map.get('satellite_password');
    if (satUrl && satUser && satPass) {
      satelliteService.reconfigure(satUrl, satUser, satPass);
      console.log('[SysCraft] Satellite service reconfigured');
    }

    const cmkUrl = map.get('checkmk_url');
    const cmkUser = map.get('checkmk_user');
    const cmkPass = map.get('checkmk_password');
    if (cmkUrl && cmkUser && cmkPass) {
      checkmkService.reconfigure(cmkUrl, cmkUser, cmkPass);
      console.log('[SysCraft] Checkmk service reconfigured');
    }

    const dnsServer = map.get('dns_server');
    const dnsPort = map.get('dns_port');
    if (dnsServer) {
      dnsService.reconfigure(
        dnsServer,
        parseInt(dnsPort || '53', 10),
        map.get('dns_zone') || undefined,
        parseInt(map.get('dns_batch_size') || '20', 10),
        parseInt(map.get('dns_batch_delay_ms') || '100', 10),
      );
      console.log('[SysCraft] DNS service reconfigured');
    }
  } catch (error) {
    console.log('[SysCraft] Service reconfigure error:', (error as Error).message);
  }
}

export default router;
