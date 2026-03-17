import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { satelliteService } from '../services/satellite.js';
import { baselineService } from '../services/baseline.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/host-collections — list all host collections
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const collections = await satelliteService.fetchHostCollections();

    // Fetch full details for each collection (list endpoint omits host_ids)
    const enriched = await Promise.all(
      collections.map(async (c: any) => {
        let hostIds: number[] = c.host_ids || [];
        const hostFqdns: string[] = [];

        // If list didn't include host_ids, fetch the individual collection
        if (!c.host_ids && c.total_hosts > 0) {
          const detail = await satelliteService.getHostCollection(c.id);
          if (detail) {
            hostIds = detail.host_ids || [];
          }
        }

        if (hostIds.length > 0) {
          const sources = await prisma.hostSource.findMany({
            where: {
              dataSource: { adapter: 'satellite' },
              sourceId: { in: hostIds.map(String) },
            },
            select: { hostFqdn: true },
          });
          hostFqdns.push(...sources.map((s) => s.hostFqdn));
        }

        return {
          id: c.id,
          name: c.name,
          description: c.description || '',
          organizationId: c.organization_id,
          totalHosts: c.total_hosts || 0,
          unlimitedHosts: c.unlimited_hosts ?? true,
          maxHosts: c.max_hosts,
          hostIds,
          hostFqdns,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        };
      })
    );

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    console.log('[SysCraft] Host collections list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch host collections from Satellite.' });
  }
});

// GET /api/host-collections/organizations — list Satellite orgs
router.get('/organizations', authenticate, async (_req: Request, res: Response) => {
  try {
    const orgs = await satelliteService.getOrganizations();
    res.json({ data: orgs });
  } catch (error) {
    console.log('[SysCraft] Organizations list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch organizations.' });
  }
});

// Helper: get Satellite content hosts (only hosts with subscription registration)
// Plain Foreman hosts without content facet won't appear in Satellite's host collection UI
async function getContentHostMap(): Promise<Map<string, number>> {
  const sources = await prisma.hostSource.findMany({
    where: { dataSource: { adapter: 'satellite' } },
    select: { hostFqdn: true, sourceId: true, rawData: true },
  });

  const map = new Map<string, number>();
  for (const s of sources) {
    const satId = parseInt(s.sourceId, 10) || 0;
    if (satId <= 0) continue;

    const data = s.rawData as any;
    // Only include hosts registered as content hosts
    if (data && data.registered) {
      map.set(s.hostFqdn, satId);
    }
  }
  return map;
}

// GET /api/host-collections/missing-agent/:agentName — hosts missing a specific agent (with Satellite IDs)
router.get('/missing-agent/:agentName', authenticate, async (req: Request, res: Response) => {
  try {
    const agentName = String(req.params.agentName);

    // Get compliance matrix
    const matrix = await baselineService.getComplianceMatrix();

    // Filter to hosts missing this agent
    const missing = matrix.filter((host) =>
      host.agents.some((a) => a.name === agentName && !a.installed)
    );

    // Only content hosts (registered in Satellite with subscription)
    const contentHostMap = await getContentHostMap();

    const hosts = missing
      .map((h) => ({
        fqdn: h.fqdn,
        satelliteId: contentHostMap.get(h.fqdn) || 0,
        ip: h.ip,
        os: h.os,
      }))
      .filter((h) => h.satelliteId > 0);

    res.json({ data: hosts, agentName, total: hosts.length });
  } catch (error) {
    console.log('[SysCraft] Missing agent query error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to query missing agents.' });
  }
});

// GET /api/host-collections/satellite-hosts — list Satellite content hosts available for adding
router.get('/satellite-hosts', authenticate, async (_req: Request, res: Response) => {
  try {
    const contentHostMap = await getContentHostMap();

    const hosts = Array.from(contentHostMap.entries()).map(([fqdn, satelliteId]) => ({
      fqdn,
      satelliteId,
    }));

    res.json({ data: hosts });
  } catch (error) {
    console.log('[SysCraft] Satellite hosts list error:', (error as Error).message);
    res.status(500).json({ error: 'Failed to fetch Satellite hosts.' });
  }
});

// POST /api/host-collections — create a new host collection
router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const { name, description, organizationId, hostIds } = req.body;

      if (!name || !organizationId) {
        res.status(400).json({ error: 'Name and organization are required.' });
        return;
      }

      const collection = await satelliteService.createHostCollection(
        organizationId,
        name,
        description || '',
      );

      // Add hosts if provided
      if (hostIds && hostIds.length > 0) {
        await satelliteService.addHostsToCollection(collection.id, hostIds);
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_collection_created',
          target: name,
          details: {
            collectionId: collection.id,
            organizationId,
            hostIds: hostIds || [],
            createdBy: req.user!.username,
          },
        },
      });

      console.log(`[SysCraft] Host collection "${name}" created by ${req.user!.username}`);

      res.status(201).json(collection);
    } catch (error) {
      const msg = (error as Error).message;
      console.log('[SysCraft] Host collection create error:', msg);
      // Forward Satellite validation errors
      if ((error as any)?.response?.data?.error) {
        res.status(422).json({ error: (error as any).response.data.error.message || (error as any).response.data.error });
        return;
      }
      res.status(500).json({ error: 'Failed to create host collection.' });
    }
  }
);

// PUT /api/host-collections/:id — update a host collection
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const { name, description } = req.body;

      const updated = await satelliteService.updateHostCollection(id, { name, description });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_collection_updated',
          target: name || `collection-${id}`,
          details: { collectionId: id, changedBy: req.user!.username },
        },
      });

      res.json(updated);
    } catch (error) {
      console.log('[SysCraft] Host collection update error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to update host collection.' });
    }
  }
);

// DELETE /api/host-collections/:id — delete a host collection
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);

      // Get name for audit log before deleting
      const collection = await satelliteService.getHostCollection(id);
      const name = collection?.name || `collection-${id}`;

      await satelliteService.deleteHostCollection(id);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'host_collection_deleted',
          target: name,
          details: { collectionId: id, deletedBy: req.user!.username },
        },
      });

      console.log(`[SysCraft] Host collection "${name}" deleted by ${req.user!.username}`);

      res.json({ message: `Host collection "${name}" deleted.` });
    } catch (error) {
      console.log('[SysCraft] Host collection delete error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to delete host collection.' });
    }
  }
);

// PUT /api/host-collections/:id/hosts — add hosts to collection
router.put(
  '/:id/hosts',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const { hostIds } = req.body;

      if (!hostIds || hostIds.length === 0) {
        res.status(400).json({ error: 'No hosts specified.' });
        return;
      }

      const result = await satelliteService.addHostsToCollection(id, hostIds);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'hosts_added_to_collection',
          target: `collection-${id}`,
          details: { collectionId: id, hostIds, changedBy: req.user!.username },
        },
      });

      res.json(result);
    } catch (error) {
      console.log('[SysCraft] Add hosts to collection error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to add hosts to collection.' });
    }
  }
);

// DELETE /api/host-collections/:id/hosts — remove hosts from collection
router.delete(
  '/:id/hosts',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const { hostIds } = req.body;

      if (!hostIds || hostIds.length === 0) {
        res.status(400).json({ error: 'No hosts specified.' });
        return;
      }

      const result = await satelliteService.removeHostsFromCollection(id, hostIds);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'hosts_removed_from_collection',
          target: `collection-${id}`,
          details: { collectionId: id, hostIds, changedBy: req.user!.username },
        },
      });

      res.json(result);
    } catch (error) {
      console.log('[SysCraft] Remove hosts from collection error:', (error as Error).message);
      res.status(500).json({ error: 'Failed to remove hosts from collection.' });
    }
  }
);

export default router;
