import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/users — list all users with their assigned host groups (admin only)
router.get(
  '/',
  authenticate,
  authorize('admin'),
  async (_req: Request, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          hostGroups: {
            include: { group: { select: { id: true, name: true, system: true } } },
          },
        },
        orderBy: { username: 'asc' },
      });

      const data = users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        hostGroups: u.hostGroups.map((hg) => ({
          id: hg.group.id,
          name: hg.group.name,
          system: hg.group.system,
        })),
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      }));

      res.json({ data, total: data.length });
    } catch (error) {
      console.log('[SysCraft] Users list error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to fetch users.' });
    }
  }
);

// POST /api/users — create a new user (admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const { username, email, password, role, hostGroupIds } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({ error: 'Username, email, and password are required.' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      const validRole = role === 'admin' ? 'admin' : 'user';

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await prisma.user.create({
        data: {
          username: username.trim(),
          email: email.trim(),
          passwordHash,
          role: validRole,
        },
      });

      // Assign host groups
      if (hostGroupIds && hostGroupIds.length > 0) {
        for (const groupId of hostGroupIds) {
          try {
            await prisma.userHostGroup.create({
              data: { userId: user.id, groupId },
            });
          } catch {
            // Skip duplicates
          }
        }
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'user_created',
          target: user.username,
          details: {
            newUserId: user.id,
            role: validRole,
            hostGroupIds: hostGroupIds || [],
            createdBy: req.user!.username,
          },
        },
      });

      console.log(`[SysCraft] User "${user.username}" (${validRole}) created by ${req.user!.username}`);

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        res.status(409).json({ error: 'Username or email already exists.' });
        return;
      }
      console.log('[SysCraft] User create error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to create user.' });
    }
  }
);

// PUT /api/users/:id — update user role and host groups (admin only)
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const { role, email, password, hostGroupIds } = req.body;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      // Build update data
      const updateData: Record<string, any> = {};
      if (role === 'admin' || role === 'user') updateData.role = role;
      if (email) updateData.email = email.trim();
      if (password && password.length >= 6) {
        const salt = await bcrypt.genSalt(12);
        updateData.passwordHash = await bcrypt.hash(password, salt);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({ where: { id }, data: updateData });
      }

      // Update host group assignments if provided
      if (hostGroupIds !== undefined) {
        // Remove all existing assignments
        await prisma.userHostGroup.deleteMany({ where: { userId: id } });
        // Add new assignments
        for (const groupId of hostGroupIds) {
          try {
            await prisma.userHostGroup.create({
              data: { userId: id, groupId },
            });
          } catch {
            // Skip invalid group IDs
          }
        }
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'user_updated',
          target: existing.username,
          details: {
            targetUserId: id,
            changes: { role, hostGroupIds },
            updatedBy: req.user!.username,
          },
        },
      });

      console.log(`[SysCraft] User "${existing.username}" updated by ${req.user!.username}`);

      // Return updated user with groups
      const updated = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true, username: true, email: true, role: true,
          hostGroups: { include: { group: { select: { id: true, name: true, system: true } } } },
        },
      });

      res.json({
        id: updated!.id,
        username: updated!.username,
        email: updated!.email,
        role: updated!.role,
        hostGroups: updated!.hostGroups.map((hg) => ({
          id: hg.group.id,
          name: hg.group.name,
          system: hg.group.system,
        })),
      });
    } catch (error) {
      console.log('[SysCraft] User update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update user.' });
    }
  }
);

// DELETE /api/users/:id — delete a user (admin only)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      // Prevent self-deletion
      if (id === req.user!.id) {
        res.status(400).json({ error: 'Cannot delete your own account.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      await prisma.user.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'user_deleted',
          target: user.username,
          details: { deletedUserId: id, deletedBy: req.user!.username },
        },
      });

      console.log(`[SysCraft] User "${user.username}" deleted by ${req.user!.username}`);
      res.json({ message: `User "${user.username}" deleted.` });
    } catch (error) {
      console.log('[SysCraft] User delete error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  }
);

export default router;
