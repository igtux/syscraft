import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';

const prisma = new PrismaClient();

function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf-8').slice(0, 1000),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Webhook request timed out')));
    req.write(body);
    req.end();
  });
}

class WebhookService {
  async fire(event: string, payload: Record<string, any>): Promise<void> {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { enabled: true, events: { has: event } },
      });

      if (webhooks.length === 0) return;

      await Promise.allSettled(
        webhooks.map((wh) => this.fireOne(wh, event, payload))
      );
    } catch (err) {
      console.log('[SysCraft] Webhook fire error:', (err as Error).message);
    }
  }

  async fireOne(
    webhook: { id: number; url: string; secret: string; method: string; headers: any; bodyTemplate: string; retryCount: number; retryDelayMs: number },
    event: string,
    payload: Record<string, any>
  ): Promise<{ success: boolean; statusCode: number | null; response: string }> {
    return this.fireWithRetry(webhook, event, payload, 0);
  }

  private async fireWithRetry(
    webhook: { id: number; url: string; secret: string; method: string; headers: any; bodyTemplate: string; retryCount: number; retryDelayMs: number },
    event: string,
    payload: Record<string, any>,
    attempt: number
  ): Promise<{ success: boolean; statusCode: number | null; response: string }> {
    const defaultPayload = {
      event,
      timestamp: new Date().toISOString(),
      source: 'SysCraft',
      data: payload,
    };

    let bodyString: string;
    if (webhook.bodyTemplate) {
      bodyString = this.renderTemplate(webhook.bodyTemplate, defaultPayload);
    } else {
      bodyString = JSON.stringify(defaultPayload);
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SysCraft-Webhook/1.0',
    };

    // Merge custom headers
    if (webhook.headers && typeof webhook.headers === 'object') {
      const custom = webhook.headers as Record<string, string>;
      for (const [k, v] of Object.entries(custom)) {
        if (k && v) headers[k] = v;
      }
    }

    // HMAC signature
    if (webhook.secret) {
      headers['X-Webhook-Signature'] = this.sign(bodyString, webhook.secret);
    }

    let statusCode: number | null = null;
    let responseBody = '';
    let success = false;

    try {
      const result = await httpRequest(webhook.url, webhook.method || 'POST', headers, bodyString);
      statusCode = result.statusCode;
      responseBody = result.body;
      success = statusCode >= 200 && statusCode < 300;
    } catch (err) {
      responseBody = (err as Error).message;
    }

    // Log attempt
    try {
      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: defaultPayload,
          statusCode,
          response: responseBody,
          success,
        },
      });

      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastFiredAt: new Date(), lastStatus: statusCode },
      });
    } catch {
      // ignore log errors
    }

    // Retry on failure
    if (!success && attempt < webhook.retryCount) {
      const delay = webhook.retryDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      return this.fireWithRetry(webhook, event, payload, attempt + 1);
    }

    return { success, statusCode, response: responseBody };
  }

  private sign(body: string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  private renderTemplate(template: string, payload: Record<string, any>): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_match, path: string) => {
      const keys = path.split('.');
      let value: any = payload;
      for (const key of keys) {
        if (value == null) return '';
        value = value[key];
      }
      return value != null ? String(value) : '';
    });
  }
}

export const webhookService = new WebhookService();
