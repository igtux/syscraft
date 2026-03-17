import { execFile } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import type { LivenessResult, LivenessSignal } from '../types/index.js';

const prisma = new PrismaClient();

export async function pingHost(ip: string, timeoutMs: number): Promise<boolean> {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  return new Promise((resolve) => {
    execFile(
      'ping',
      ['-c', '1', '-W', String(timeoutSec), ip],
      { timeout: timeoutMs + 1000 },
      (error) => {
        resolve(!error);
      }
    );
  });
}

export async function pingAllHosts(
  hosts: Array<{ fqdn: string; ip: string }>,
  batchSize: number,
  timeoutMs: number
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  for (let i = 0; i < hosts.length; i += batchSize) {
    const batch = hosts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (h) => {
        if (!h.ip) return { fqdn: h.fqdn, success: false };
        const success = await pingHost(h.ip, timeoutMs);
        return { fqdn: h.fqdn, success };
      })
    );

    for (const r of batchResults) {
      results.set(r.fqdn, r.success);
      try {
        await prisma.host.update({
          where: { fqdn: r.fqdn },
          data: {
            lastPingAt: new Date(),
            lastPingSuccess: r.success,
          },
        });
      } catch {
        // Host may have been deleted
      }
    }
  }

  return results;
}

export function isHostAlive(
  host: {
    fqdn: string;
    lastPingAt: Date | null;
    lastPingSuccess: boolean;
    sources: Array<{ source: string; rawData: Record<string, any>; lastSynced: Date }>;
  },
  cleanupThresholdDays: number
): LivenessResult {
  const signals: LivenessSignal[] = [];
  let lastSeenAnywhere: Date | null = null;

  // Signal 1: ICMP Ping
  if (host.lastPingAt) {
    signals.push({
      source: 'ping',
      alive: host.lastPingSuccess,
      timestamp: host.lastPingAt.toISOString(),
      detail: host.lastPingSuccess ? 'ICMP ping responded' : 'ICMP ping timed out',
    });
    if (host.lastPingSuccess) {
      lastSeenAnywhere = host.lastPingAt;
    }
  }

  // Signal 2: Checkmk status
  const cmkSource = host.sources.find((s) => s.source === 'checkmk');
  if (cmkSource) {
    const data = cmkSource.rawData;
    const cmkAlive = data.status === 'UP';
    signals.push({
      source: 'checkmk',
      alive: cmkAlive,
      timestamp: cmkSource.lastSynced.toISOString(),
      detail: `Checkmk status: ${data.status || 'unknown'}`,
    });
    if (cmkAlive && (!lastSeenAnywhere || cmkSource.lastSynced > lastSeenAnywhere)) {
      lastSeenAnywhere = cmkSource.lastSynced;
    }
  }

  // Signal 3: Satellite last checkin
  const satSource = host.sources.find((s) => s.source === 'satellite');
  if (satSource) {
    const data = satSource.rawData;
    const checkin = data.lastCheckin ? new Date(data.lastCheckin as string) : null;
    if (checkin && !isNaN(checkin.getTime())) {
      const hoursSinceCheckin = (Date.now() - checkin.getTime()) / (1000 * 60 * 60);
      const satAlive = hoursSinceCheckin < cleanupThresholdDays * 24;
      signals.push({
        source: 'satellite',
        alive: satAlive,
        timestamp: checkin.toISOString(),
        detail: `Last Satellite checkin: ${checkin.toISOString()}`,
      });
      if (satAlive && (!lastSeenAnywhere || checkin > lastSeenAnywhere)) {
        lastSeenAnywhere = checkin;
      }
    }
  }

  // Determine overall liveness
  const aliveSignals = signals.filter((s) => s.alive);
  const alive = aliveSignals.length > 0;

  let confidence: string;
  if (signals.length === 0) {
    confidence = 'none';
  } else if (aliveSignals.length === signals.length) {
    confidence = 'high';
  } else if (aliveSignals.length > 0) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  let deadSinceDays: number | null = null;
  if (!alive && lastSeenAnywhere) {
    deadSinceDays = Math.floor((Date.now() - lastSeenAnywhere.getTime()) / (1000 * 60 * 60 * 24));
  } else if (!alive && signals.length > 0) {
    // Never seen alive
    deadSinceDays = null;
  }

  return {
    alive,
    confidence,
    signals,
    lastSeenAnywhere: lastSeenAnywhere?.toISOString() ?? null,
    deadSinceDays,
  };
}
