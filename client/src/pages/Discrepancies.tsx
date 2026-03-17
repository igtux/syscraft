import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ShieldOff,
  MonitorOff,
  ServerOff,
  Clock,
  Ghost,
  Filter,
  Info,
  AlertCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn, severityColor } from '@/lib/utils';
import { getDiscrepancies, type Discrepancy, type DiscrepancyParams } from '@/lib/api';

function getTypeIcon(type: Discrepancy['type']) {
  switch (type) {
    case 'missing_in_checkmk':
      return { icon: MonitorOff, color: 'text-amber-400', bg: 'bg-amber-500/10' };
    case 'missing_in_satellite':
      return { icon: ServerOff, color: 'text-amber-400', bg: 'bg-amber-500/10' };
    case 'missing_in_dns':
      return { icon: ShieldOff, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    case 'dns_reverse_missing':
      return { icon: ShieldOff, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    case 'dns_forward_reverse_mismatch':
      return { icon: AlertTriangle, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    case 'stale_entry':
      return { icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' };
    case 'orphan':
      return { icon: Ghost, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    default:
      return { icon: AlertTriangle, color: 'text-slate-400', bg: 'bg-slate-500/10' };
  }
}

function formatType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function Discrepancies() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DiscrepancyParams>({
    type: '',
    severity: '',
  });

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['discrepancies', filters],
    queryFn: () => getDiscrepancies(filters),
  });

  const items = response?.data ?? [];

  const typeCounts = items.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {});

  const severityCounts = items.reduce<Record<string, number>>((acc, d) => {
    acc[d.severity] = (acc[d.severity] || 0) + 1;
    return acc;
  }, {});

  const filteredItems = items.filter((d) => {
    if (filters.type && d.type !== filters.type) return false;
    if (filters.severity && d.severity !== filters.severity) return false;
    return true;
  });

  return (
    <div>
      <Header
        title="Discrepancies"
        subtitle={`${items.length} discrepancies detected across your infrastructure`}
      />

      <div className="p-6 space-y-4">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load discrepancies.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-48"
            >
              <option value="">All Types ({items.length})</option>
              <option value="missing_in_checkmk">Missing In Checkmk ({typeCounts['missing_in_checkmk'] ?? 0})</option>
              <option value="missing_in_satellite">Missing In Satellite ({typeCounts['missing_in_satellite'] ?? 0})</option>
              <option value="missing_in_dns">Missing In DNS ({typeCounts['missing_in_dns'] ?? 0})</option>
              <option value="dns_reverse_missing">DNS Reverse Missing ({typeCounts['dns_reverse_missing'] ?? 0})</option>
              <option value="dns_forward_reverse_mismatch">DNS Forward/Reverse Mismatch ({typeCounts['dns_forward_reverse_mismatch'] ?? 0})</option>
              <option value="stale_entry">Stale Entry ({typeCounts['stale_entry'] ?? 0})</option>
              <option value="orphan">Orphan ({typeCounts['orphan'] ?? 0})</option>
            </select>
          </div>

          <select
            value={filters.severity}
            onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
            className="input-field appearance-none cursor-pointer min-w-40"
          >
            <option value="">All Severities</option>
            <option value="high">High ({severityCounts['high'] ?? 0})</option>
            <option value="medium">Medium ({severityCounts['medium'] ?? 0})</option>
            <option value="low">Low ({severityCounts['low'] ?? 0})</option>
          </select>

          {(filters.type || filters.severity) && (
            <button
              onClick={() => setFilters({ type: '', severity: '' })}
              className="btn-ghost text-sm text-blue-400"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No discrepancies found</p>
              <p className="text-sm text-slate-500 mt-1">
                {filters.type || filters.severity
                  ? 'Try adjusting your filters.'
                  : 'Your infrastructure is looking clean.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((discrepancy) => {
              const typeInfo = getTypeIcon(discrepancy.type);
              const TypeIcon = typeInfo.icon;
              const sevColors = severityColor(discrepancy.severity);

              return (
                <div
                  key={`${discrepancy.fqdn}-${discrepancy.type}`}
                  className="bg-slate-800 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-all duration-200"
                >
                  <div className="flex items-start gap-4">
                    <div className={cn('p-2.5 rounded-lg flex-shrink-0', typeInfo.bg)}>
                      <TypeIcon className={cn('w-5 h-5', typeInfo.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => navigate(`/hosts/${encodeURIComponent(discrepancy.fqdn)}`)}
                              className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {discrepancy.fqdn}
                            </button>
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                              sevColors.bg,
                              sevColors.text,
                              sevColors.border
                            )}>
                              {discrepancy.severity === 'high' && <AlertCircle className="w-3 h-3" />}
                              {discrepancy.severity === 'medium' && <AlertTriangle className="w-3 h-3" />}
                              {discrepancy.severity === 'low' && <Info className="w-3 h-3" />}
                              {discrepancy.severity}
                            </span>
                            <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-700/50 rounded">
                              {formatType(discrepancy.type)}
                            </span>
                          </div>

                          <p className="text-sm text-slate-300 mt-2">{discrepancy.description}</p>
                        </div>

                        <span className="text-xs text-slate-500 flex-shrink-0 whitespace-nowrap">
                          {discrepancy.system}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2 p-2.5 bg-slate-700/20 rounded-lg border border-slate-700/50">
                        <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <p className="text-xs text-slate-300">
                          <span className="text-blue-400 font-medium">Suggested: </span>
                          {discrepancy.suggestedAction}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
