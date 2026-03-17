import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Helper: check if a group is system-managed
async function isSystemGroup(id: number): Promise<boolean> {
  const group = await prisma.hostGroup.findUnique({ where: { id }, select: { system: true } });
  return group?.system === true;
}

// GET /api/host-groups — list all host groups
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const groups = await prisma.hostGroup.findMany({
      include: {
        members: {
          include: { host: { select: { fqdn: true, ip: true, status: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const data = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      system: g.system,
      hostCount: g.members.length,
      hosts: g.members.map((m) => ({
        fqdn: m.host.fqdn,
        ip: m.host.ip,
        status: m.host.status,
      })),
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    res.json({ data, total: data.length });
  } catch (error) {
    console.log('[SysCraft] Host groups list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch host groups.' });
  }
});

// POST /api/host-groups — create a host group (admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Name is required.' });
        return;
      }

      const group = await prisma.hostGroup.create({
        data: { name: name.trim(), description: description?.trim() || '', system: false },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_group_created',
          target: group.name,
          details: JSON.stringify({ groupId: group.id, createdBy: req.user!.username }),
        },
      });

      console.log(`[SysCraft] Host group "${group.name}" created by ${req.user!.username}`);

      res.status(201).json({
        id: group.id,
        name: group.name,
        description: group.description,
        system: false,
        hostCount: 0,
        hosts: [],
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        res.status(409).json({ error: 'A host group with that name already exists.' });
        return;
      }
      console.log('[SysCraft] Host group create error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to create host group.' });
    }
  }
);

// PUT /api/host-groups/:id — update a host group (admin only, not system groups)
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      if (await isSystemGroup(id)) {
        res.status(400).json({ error: 'Cannot modify a system-managed group.' });
        return;
      }

      const { name, description } = req.body;

      const group = await prisma.hostGroup.update({
        where: { id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description.trim() } : {}),
        },
      });

      res.json({
        id: group.id,
        name: group.name,
        description: group.description,
        system: group.system,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        res.status(404).json({ error: 'Host group not found.' });
        return;
      }
      console.log('[SysCraft] Host group update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update host group.' });
    }
  }
);

// DELETE /api/host-groups/:id — delete a host group (admin only, not system groups)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      const group = await prisma.hostGroup.findUnique({ where: { id } });
      if (!group) {
        res.status(404).json({ error: 'Host group not found.' });
        return;
      }

      if (group.system) {
        res.status(400).json({ error: 'Cannot delete a system-managed group.' });
        return;
      }

      await prisma.hostGroup.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_group_deleted',
          target: group.name,
          details: JSON.stringify({ groupId: id, deletedBy: req.user!.username }),
        },
      });

      console.log(`[SysCraft] Host group "${group.name}" deleted by ${req.user!.username}`);
      res.json({ message: `Host group "${group.name}" deleted.` });
    } catch (error) {
      console.log('[SysCraft] Host group delete error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to delete host group.' });
    }
  }
);

// PUT /api/host-groups/:id/hosts — add hosts to group (admin only, not system groups)
router.put(
  '/:id/hosts',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      if (await isSystemGroup(id)) {
        res.status(400).json({ error: 'Cannot modify membership of a system-managed group.' });
        return;
      }

      const { fqdns } = req.body as { fqdns: string[] };

      if (!fqdns || fqdns.length === 0) {
        res.status(400).json({ error: 'No hosts specified.' });
        return;
      }

      let added = 0;
      for (const fqdn of fqdns) {
        try {
          await prisma.hostGroupMember.create({
            data: { groupId: id, hostFqdn: fqdn },
          });
          added++;
        } catch {
          // Skip duplicates
        }
      }

      res.json({ message: `${added} host(s) added.` });
    } catch (error) {
      console.log('[SysCraft] Add hosts to group error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to add hosts to group.' });
    }
  }
);

// DELETE /api/host-groups/:id/hosts — remove hosts from group (admin only, not system groups)
router.delete(
  '/:id/hosts',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      if (await isSystemGroup(id)) {
        res.status(400).json({ error: 'Cannot modify membership of a system-managed group.' });
        return;
      }

      const { fqdns } = req.body as { fqdns: string[] };

      if (!fqdns || fqdns.length === 0) {
        res.status(400).json({ error: 'No hosts specified.' });
        return;
      }

      const result = await prisma.hostGroupMember.deleteMany({
        where: { groupId: id, hostFqdn: { in: fqdns } },
      });

      res.json({ message: `${result.count} host(s) removed.` });
    } catch (error) {
      console.log('[SysCraft] Remove hosts from group error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to remove hosts from group.' });
    }
  }
);

export default router;
