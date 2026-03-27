import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PlusCircle,
  MinusCircle,
  ArrowRightLeft,
  Activity,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Globe,
  Wifi,
  Clock,
  ChevronDown,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import { cn, formatRelative } from '@/lib/utils';
import { getHostTimeline, type HostEvent } from '@/lib/api';

const eventConfig: Record<string, { icon: any; color: string; label: string }> = {
  host_discovered: { icon: PlusCircle, color: 'text-green-400', label: 'Host Discovered' },
  source_added: { icon: Globe, color: 'text-blue-400', label: 'Source Added' },
  source_removed: { icon: MinusCircle, color: 'text-red-400', label: 'Source Removed' },
  status_changed: { icon: ArrowRightLeft, color: 'text-purple-400', label: 'Status Changed' },
  liveness_changed: { icon: Activity, color: 'text-amber-400', label: 'Liveness Changed' },
  os_changed: { icon: Cpu, color: 'text-blue-400', label: 'OS Category Changed' },
  recommendation_created: { icon: AlertTriangle, color: 'text-amber-400', label: 'Recommendation' },
  recommendation_resolved: { icon: CheckCircle2, color: 'text-green-400', label: 'Resolved' },
  recommendation_dismissed: { icon: XCircle, color: 'text-slate-400', label: 'Dismissed' },
  ping_changed: { icon: Activity, color: 'text-cyan-400', label: 'Ping Changed' },
  ip_changed: { icon: Globe, color: 'text-blue-400', label: 'IP Changed' },
  mac_changed: { icon: Wifi, color: 'text-blue-400', label: 'MAC Changed' },
};

function describeEvent(event: HostEvent): string {
  const d = event.detail as Record<string, any>;
  switch (event.event) {
    case 'host_discovered':
      return `First discovered via ${d.source || 'unknown source'}`;
    case 'source_added':
      return `Added to ${d.source || 'unknown'}`;
    case 'source_removed':
      return `Removed from ${d.source || 'unknown'}`;
    case 'status_changed':
      return `Status: ${d.oldStatus} \u2192 ${d.newStatus}`;
    case 'os_changed':
      return `OS category: ${d.oldCategory} \u2192 ${d.newCategory}`;
    case 'recommendation_created':
      return `[${d.severity}] ${d.type?.replace(/_/g, ' ')} \u2014 ${d.description || ''}`.slice(0, 120);
    case 'recommendation_resolved':
      return `Resolved: ${d.type?.replace(/_/g, ' ')}`;
    case 'recommendation_dismissed':
      return `Dismissed: ${d.type?.replace(/_/g, ' ')}`;
    case 'ping_changed':
      return `Ping: ${d.oldState?.replace('_', ' ')} \u2192 ${d.newState?.replace('_', ' ')}`;
    case 'ip_changed':
      return `IP: ${d.oldIp} \u2192 ${d.newIp}`;
    case 'mac_changed':
      return `MAC: ${d.oldMac} \u2192 ${d.newMac}`;
    default:
      return event.event.replace(/_/g, ' ');
  }
}

export default function HostTimeline({ fqdn }: { fqdn: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['hostTimeline', fqdn, page],
    queryFn: () => getHostTimeline(fqdn, { page, pageSize: 20 }),
    enabled: !!fqdn,
  });

  const events = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasMore = page * 20 < total;

  if (!isLoading && events.length === 0) return null;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          <span>Timeline</span>
          {total > 0 && <span className="text-xs text-slate-500 font-normal">({total} events)</span>}
        </div>
      }
    >
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-700/50" />

        <div className="space-y-0">
          {events.map((event, idx) => {
            const config = eventConfig[event.event] || {
              icon: Clock,
              color: 'text-slate-400',
              label: event.event,
            };
            const Icon = config.icon;

            return (
              <div key={event.id} className="relative flex items-start gap-3 py-2.5 pl-1">
                <div className={cn('z-10 flex-shrink-0 p-1 rounded-full bg-slate-800 ring-2 ring-slate-800', config.color)}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300">{describeEvent(event)}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{formatRelative(event.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {isLoading && (
          <div className="py-4 text-center text-xs text-slate-500">Loading events...</div>
        )}

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
            Load more
          </button>
        )}
      </div>
    </Card>
  );
}
