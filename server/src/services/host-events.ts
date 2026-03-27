import { PrismaClient } from '@prisma/client';
import { webhookService } from './webhook.js';

const prisma = new PrismaClient();

// Map host event types to webhook event types
function mapToWebhookEvent(event: string, detail: Record<string, any>): string | null {
  switch (event) {
    case 'recommendation_created':
      if (detail.severity === 'critical') return 'recommendation_critical';
      if (detail.severity === 'high') return 'recommendation_high';
      return null;
    case 'status_changed':
      if (detail.newStatus === 'stale') return 'host_stale';
      return null;
    case 'host_discovered':
      return 'host_discovered';
    case 'ping_changed':
    case 'liveness_changed':
      return 'liveness_changed';
    default:
      return null;
  }
}

class HostEventService {
  async emit(hostFqdn: string, event: string, detail: Record<string, any>): Promise<void> {
    try {
      // Write to HostEvent table
      await prisma.hostEvent.create({
        data: { hostFqdn, event, detail },
      });

      // Fire matching webhooks
      const webhookEvent = mapToWebhookEvent(event, detail);
      if (webhookEvent) {
        webhookService.fire(webhookEvent, { hostFqdn, event, ...detail }).catch((err) => {
          console.log('[SysCraft] Webhook fire error:', (err as Error).message);
        });
      }
    } catch (err) {
      // Fire-and-forget: never disrupt caller
      console.log('[SysCraft] Host event emit error:', (err as Error).message);
    }
  }

  async getTimeline(
    hostFqdn: string,
    page: number,
    pageSize: number
  ): Promise<{ data: any[]; total: number }> {
    const [events, total] = await Promise.all([
      prisma.hostEvent.findMany({
        where: { hostFqdn },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.hostEvent.count({ where: { hostFqdn } }),
    ]);

    return {
      data: events.map((e) => ({
        id: e.id,
        hostFqdn: e.hostFqdn,
        event: e.event,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
    };
  }

  async getRecentGlobal(limit: number): Promise<any[]> {
    const events = await prisma.hostEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events.map((e) => ({
      id: e.id,
      hostFqdn: e.hostFqdn,
      event: e.event,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}

export const hostEventService = new HostEventService();
