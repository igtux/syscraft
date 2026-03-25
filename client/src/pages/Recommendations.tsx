import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  AlertCircle,
  AlertTriangle,
  Info,
  ClipboardCheck,
  Server,
  Monitor,
  Globe,
  Wifi,
  UserCog,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import CommandBlock from '@/components/ui/CommandBlock';
import { cn, severityColor } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  getRecommendations,
  getRecommendationSummary,
  getRecommendationsBySystem,
  getRecommendationCommands,
  dismissRecommendation,
  resolveRecommendation,
  type Recommendation,
  type RecommendationListParams,
} from '@/lib/api';

type ViewMode = 'host' | 'system';

function formatType(type: string): string {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function severityOrder(s: string): number {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return order[s] ?? 5;
}

function systemIcon(system: string) {
  switch (system) {
    case 'satellite': return Globe;
    case 'checkmk': return Monitor;
    case 'dns': return Wifi;
    case 'host': return Server;
    default: return UserCog;
  }
}

export default function Recommendations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [viewMode, setViewMode] = useState<ViewMode>('host');
  const [filters, setFilters] = useState<RecommendationListParams>({
    page: 1,
    pageSize: 50,
    type: '',
    severity: '',
    system: '',
    search: '',
    status: 'open',
  });
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  const { data: summaryData } = useQuery({
    queryKey: ['recommendationSummary'],
    queryFn: getRecommendationSummary,
    refetchInterval: 60_000,
  });

  const { data: recsData, isLoading } = useQuery({
    queryKey: ['recommendations', filters],
    queryFn: () => getRecommendations(filters),
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => dismissRecommendation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['recommendationSummary'] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => resolveRecommendation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['recommendationSummary'] });
    },
  });

  const recs = recsData?.data ?? [];
  const total = recsData?.total ?? 0;

  // Group by host for host view
  const byHost = new Map<string, Recommendation[]>();
  for (const r of recs) {
    const list = byHost.get(r.hostFqdn) || [];
    list.push(r);
    byHost.set(r.hostFqdn, list);
  }

  // Group by system for system view
  const bySystem = new Map<string, Recommendation[]>();
  for (const r of recs) {
    const list = bySystem.get(r.systemTarget) || [];
    list.push(r);
    bySystem.set(r.systemTarget, list);
  }

  const toggleHost = (fqdn: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(fqdn)) next.delete(fqdn);
      else next.add(fqdn);
      return next;
    });
  };

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const copySystemScript = async (system: string) => {
    try {
      const script = await getRecommendationCommands(system);
      await copyToClipboard(script);
      setCopiedScript(system);
      setTimeout(() => setCopiedScript(null), 2000);
    } catch {
      // ignore
    }
  };

  const severityCounts = summaryData?.bySeverity ?? {};

  return (
    <div>
      <Header
        title="Recommendations"
        subtitle={`${total} actionable recommendations across your infrastructure`}
      />

      <div className="p-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
            const count = severityCounts[sev] || 0;
            const colors = severityColor(sev === 'critical' ? 'high' : sev === 'info' ? 'low' : sev);
            return (
              <button
                key={sev}
                onClick={() => setFilters((f) => ({ ...f, severity: f.severity === sev ? '' : sev, page: 1 }))}
                className={cn(
                  'p-3 rounded-lg border text-center transition-all',
                  filters.severity === sev
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                )}
              >
                <p className={cn('text-2xl font-bold tabular-nums', count > 0 ? colors.text : 'text-slate-600')}>
                  {count}
                </p>
                <p className="text-xs text-slate-400 capitalize mt-0.5">{sev}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by host FQDN..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              className="input-field pl-10"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}
              className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-44"
            >
              <option value="">All Types</option>
              <option value="register_satellite">Register Satellite</option>
              <option value="add_checkmk">Add Checkmk</option>
              <option value="remove_checkmk">Remove Checkmk</option>
              <option value="remove_satellite">Remove Satellite</option>
              <option value="install_agent">Install Agent</option>
              <option value="cleanup_dead">Cleanup Dead</option>
              <option value="classify_os">Classify OS</option>
              <option value="ip_reuse">IP Reuse</option>
              <option value="add_dns">Add DNS</option>
              <option value="fix_dns_reverse">Fix DNS Reverse</option>
              <option value="fix_dns_mismatch">Fix DNS Mismatch</option>
            </select>
          </div>

          <select
            value={filters.system}
            onChange={(e) => setFilters((f) => ({ ...f, system: e.target.value, page: 1 }))}
            className="input-field appearance-none cursor-pointer min-w-36"
          >
            <option value="">All Systems</option>
            <option value="satellite">Satellite</option>
            <option value="checkmk">Checkmk</option>
            <option value="dns">DNS</option>
            <option value="host">Host</option>
            <option value="admin">Admin</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center border border-slate-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('host')}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                viewMode === 'host' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              )}
            >
              Per Host
            </button>
            <button
              onClick={() => setViewMode('system')}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                viewMode === 'system' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              )}
            >
              Per System
            </button>
          </div>

          {(filters.type || filters.severity || filters.system || filters.search) && (
            <button
              onClick={() => setFilters((f) => ({ ...f, type: '', severity: '', system: '', search: '', page: 1 }))}
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
        ) : recs.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <ClipboardCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No recommendations found</p>
              <p className="text-sm text-slate-500 mt-1">
                {filters.type || filters.severity || filters.system || filters.search
                  ? 'Try adjusting your filters.'
                  : 'Your infrastructure is looking clean.'}
              </p>
            </div>
          </Card>
        ) : viewMode === 'host' ? (
          /* Per-Host View */
          <div className="space-y-3">
            {[...byHost.entries()]
              .sort((a, b) => {
                const aMin = Math.min(...a[1].map((r) => severityOrder(r.severity)));
                const bMin = Math.min(...b[1].map((r) => severityOrder(r.severity)));
                return aMin - bMin;
              })
              .map(([fqdn, hostRecs]) => {
                const expanded = expandedHosts.has(fqdn);
                const worstSeverity = hostRecs.reduce(
                  (worst, r) => (severityOrder(r.severity) < severityOrder(worst) ? r.severity : worst),
                  'info'
                );
                const sevColors = severityColor(worstSeverity === 'critical' ? 'high' : worstSeverity === 'info' ? 'low' : worstSeverity as any);

                return (
                  <div key={fqdn} className="bg-slate-800 rounded-lg border border-slate-700">
                    <button
                      onClick={() => toggleHost(fqdn)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-750 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/hosts/${encodeURIComponent(fqdn)}`); }}
                          className="text-sm font-medium text-blue-400 hover:text-blue-300"
                        >
                          {fqdn}
                        </button>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium border',
                          sevColors.bg, sevColors.text, sevColors.border
                        )}>
                          {hostRecs.length} {hostRecs.length === 1 ? 'recommendation' : 'recommendations'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[...new Set(hostRecs.map((r) => r.systemTarget))].map((sys) => {
                          const SysIcon = systemIcon(sys);
                          return <SysIcon key={sys} className="w-4 h-4 text-slate-500" title={sys} />;
                        })}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-slate-700/50 p-4 space-y-4">
                        {hostRecs.map((rec) => (
                          <RecommendationCard
                            key={rec.id}
                            rec={rec}
                            isAdmin={isAdmin}
                            onDismiss={() => dismissMut.mutate(rec.id)}
                            onResolve={() => resolveMut.mutate(rec.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          /* Per-System View */
          <div className="space-y-6">
            {[...bySystem.entries()].map(([system, sysRecs]) => {
              const SysIcon = systemIcon(system);
              return (
                <Card
                  key={system}
                  title={
                    <div className="flex items-center gap-2">
                      <SysIcon className="w-5 h-5 text-blue-400" />
                      <span className="capitalize">{system}</span>
                      <span className="text-xs text-slate-500 font-normal">({sysRecs.length} recommendations)</span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => copySystemScript(system)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        {copiedScript === system ? (
                          <>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy All Commands
                          </>
                        )}
                      </button>
                    </div>
                    {sysRecs.map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        rec={rec}
                        isAdmin={isAdmin}
                        onDismiss={() => dismissMut.mutate(rec.id)}
                        onResolve={() => resolveMut.mutate(rec.id)}
                        showHost
                      />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  isAdmin,
  onDismiss,
  onResolve,
  showHost,
}: {
  rec: Recommendation;
  isAdmin: boolean;
  onDismiss: () => void;
  onResolve: () => void;
  showHost?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const sevColors = severityColor(
    rec.severity === 'critical' ? 'high' : rec.severity === 'info' ? 'low' : (rec.severity as any)
  );

  return (
    <div className="bg-slate-700/20 rounded-lg border border-slate-700/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showHost && (
              <button
                onClick={() => navigate(`/hosts/${encodeURIComponent(rec.hostFqdn)}`)}
                className="text-sm font-medium text-blue-400 hover:text-blue-300"
              >
                {rec.hostFqdn}
              </button>
            )}
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
              sevColors.bg, sevColors.text, sevColors.border
            )}>
              {(rec.severity === 'critical' || rec.severity === 'high') && <AlertCircle className="w-3 h-3" />}
              {rec.severity === 'medium' && <AlertTriangle className="w-3 h-3" />}
              {(rec.severity === 'low' || rec.severity === 'info') && <Info className="w-3 h-3" />}
              {rec.severity}
            </span>
            <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-700/50 rounded">
              {formatType(rec.type)}
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-2">{rec.description}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {rec.commands.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              title={expanded ? 'Hide commands' : 'Show commands'}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={onResolve}
                className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                title="Mark resolved"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDismiss}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && rec.commands.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <CommandBlock commands={rec.commands} />
        </div>
      )}
    </div>
  );
}
