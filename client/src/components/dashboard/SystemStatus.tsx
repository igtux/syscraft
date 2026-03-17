import { Circle, ExternalLink } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import Card from '@/components/ui/Card';
import type { SystemStatus as SystemStatusType } from '@/lib/api';

interface SystemStatusProps {
  sources: SystemStatusType[];
  loading?: boolean;
}

const sourceIcons: Record<string, string> = {
  Satellite: '/satellite.svg',
  Checkmk: '/checkmk.svg',
  DNS: '/dns.svg',
};

function getSourceInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function SystemStatus({ sources, loading }: SystemStatusProps) {
  if (loading) {
    return (
      <Card title="System Status" subtitle="Data source connectivity">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-slate-700/30 rounded-lg animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-slate-700" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-slate-700 rounded mb-2" />
                <div className="h-3 w-32 bg-slate-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="System Status" subtitle="Data source connectivity">
      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.name}
            className="flex items-center gap-4 p-3 bg-slate-700/20 rounded-lg border border-slate-700/50 transition-all duration-200 hover:bg-slate-700/30"
          >
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold',
              source.connected ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-700 text-slate-500'
            )}>
              {sourceIcons[source.name] ? getSourceInitial(source.name) : getSourceInitial(source.name)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-white">{source.name}</h4>
                <Circle
                  className={cn(
                    'w-2 h-2 flex-shrink-0',
                    source.connected
                      ? 'fill-green-500 text-green-500'
                      : 'fill-red-500 text-red-500'
                  )}
                />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {source.lastSync
                  ? `Synced ${formatRelative(source.lastSync)}`
                  : 'Never synced'}
              </p>
              {source.error && (
                <p className="text-xs text-red-400 mt-0.5">{source.error}</p>
              )}
            </div>

            <div className="text-right flex-shrink-0">
              <p className="text-lg font-semibold text-white tabular-nums">
                {source.hostCount}
              </p>
              <p className="text-xs text-slate-500">hosts</p>
            </div>

            <ExternalLink className="w-4 h-4 text-slate-600 flex-shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}
