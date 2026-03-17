import {
  Server,
  RefreshCw,
  AlertTriangle,
  ArrowRightLeft,
  LogIn,
  Database,
  Settings,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import Card from '@/components/ui/Card';
import type { AuditEvent } from '@/lib/api';

interface RecentEventsProps {
  events: AuditEvent[];
  loading?: boolean;
}

function getEventIcon(action: string) {
  switch (action) {
    case 'login':
      return { icon: LogIn, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 'sync_completed':
      return { icon: ArrowRightLeft, color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'host_status_changed':
      return { icon: Server, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    case 'manual_sync_triggered':
      return { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 'database_seeded':
      return { icon: Database, color: 'text-slate-400', bg: 'bg-slate-500/10' };
    case 'settings_updated':
      return { icon: Settings, color: 'text-amber-400', bg: 'bg-amber-500/10' };
    case 'password_changed':
      return { icon: Lock, color: 'text-red-400', bg: 'bg-red-500/10' };
    default:
      return { icon: ShieldCheck, color: 'text-slate-400', bg: 'bg-slate-500/10' };
  }
}

function buildDescription(event: AuditEvent): string {
  const details = event.details as Record<string, unknown>;

  switch (event.action) {
    case 'login':
      return `${event.username ?? 'Unknown user'} logged in`;
    case 'sync_completed':
      return `Sync completed for ${event.target}${details?.hostsFound ? ` — ${details.hostsFound} hosts found` : ''}`;
    case 'host_status_changed':
      return `Host ${event.target} status changed${details?.from && details?.to ? ` from ${details.from} to ${details.to}` : ''}`;
    case 'manual_sync_triggered':
      return `Manual sync triggered${event.username ? ` by ${event.username}` : ''}`;
    case 'database_seeded':
      return `Database seeded: ${event.target}`;
    case 'settings_updated':
      return `Settings updated${event.username ? ` by ${event.username}` : ''}`;
    case 'password_changed':
      return `Password changed for ${event.target}`;
    default:
      return `${event.action.replace(/_/g, ' ')}: ${event.target}`;
  }
}

export default function RecentEvents({ events, loading }: RecentEventsProps) {
  if (loading) {
    return (
      <Card title="Recent Events" subtitle="Latest audit activity">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-3/4 bg-slate-700 rounded mb-2" />
                <div className="h-3 w-1/4 bg-slate-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Recent Events" subtitle="Latest audit activity">
      <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No recent events</p>
        ) : (
          events.map((event, i) => {
            const { icon: Icon, color, bg } = getEventIcon(event.action);

            return (
              <div
                key={event.id}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-lg transition-colors hover:bg-slate-700/20',
                  i === 0 && 'animate-fade-in'
                )}
              >
                <div className={cn('p-1.5 rounded-lg flex-shrink-0', bg)}>
                  <Icon className={cn('w-4 h-4', color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 leading-snug">
                    {buildDescription(event)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {event.target && (
                      <span className="text-xs text-blue-400 font-mono">{event.target}</span>
                    )}
                    <span className="text-xs text-slate-500">{formatRelative(event.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
