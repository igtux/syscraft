import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Globe,
  Monitor,
  Activity,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { cn, formatRelative, scoreColor } from '@/lib/utils';
import { getHosts, type HostSummary, type HostListParams } from '@/lib/api';

type ViewMode = 'table' | 'grid';

export default function Hosts() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [params, setParams] = useState<HostListParams>({
    page: 1,
    pageSize: 20,
    status: '',
    search: '',
    source: '',
    osCategory: '',
    sortBy: 'fqdn',
    sortDir: 'asc',
  });

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['hosts', params],
    queryFn: () => getHosts(params),
    placeholderData: (previousData) => previousData,
  });

  const updateParams = useCallback((updates: Partial<HostListParams>) => {
    setParams((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSort = useCallback((field: string) => {
    setParams((prev) => ({
      ...prev,
      sortBy: field,
      sortDir: prev.sortBy === field && prev.sortDir === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const columns: Column<HostSummary>[] = [
    {
      header: 'Host',
      accessor: 'fqdn',
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-white">{row.fqdn}</p>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{row.ip}</p>
        </div>
      ),
    },
    {
      header: 'OS',
      accessor: 'os',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">{row.os}</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-medium capitalize border',
            row.osCategory === 'linux' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
            row.osCategory === 'windows' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
            row.osCategory === 'appliance' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
            'bg-slate-500/10 text-slate-400 border-slate-500/20'
          )}>
            {row.osCategory}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} size="sm" />
          <span className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            row.lastPingSuccess ? 'bg-green-400' : 'bg-slate-600'
          )} title={row.lastPingSuccess ? 'Ping OK' : 'No ping'} />
        </div>
      ),
    },
    {
      header: 'Sources',
      accessor: 'sources',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.sources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300"
              title={source}
            >
              {source === 'satellite' ? (
                <Globe className="w-3 h-3 text-blue-400" />
              ) : (
                <Monitor className="w-3 h-3 text-green-400" />
              )}
              {source}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Compliance',
      accessor: 'complianceScore',
      sortable: true,
      render: (row) => {
        const colors = scoreColor(row.complianceScore);
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden max-w-24">
              <div
                className={cn('h-full rounded-full transition-all duration-500', colors.bg)}
                style={{ width: `${row.complianceScore}%` }}
              />
            </div>
            <span className={cn('text-xs font-medium tabular-nums', colors.text)}>
              {row.complianceScore}%
            </span>
          </div>
        );
      },
    },
    {
      header: 'Last Seen',
      accessor: 'lastSeen',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-slate-400">{formatRelative(row.lastSeen)}</span>
      ),
    },
  ];

  const hosts = data?.data ?? [];
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.page ?? 1;
  const total = data?.total ?? 0;

  return (
    <div>
      <Header title="Host Inventory" subtitle={`${total} hosts across all sources`} />

      <div className="p-6 space-y-4">
        {/* Compact toolbar */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 space-y-3">
          {/* Row 1: Status pills + view toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['active', 'partial', 'stale', 'new'] as const).map((st) => {
                const active = params.status === st;
                const colors: Record<string, string> = {
                  active: 'bg-green-500/10 text-green-400',
                  partial: 'bg-amber-500/10 text-amber-400',
                  stale: 'bg-red-500/10 text-red-400',
                  new: 'bg-blue-500/10 text-blue-400',
                };
                return (
                  <button
                    key={st}
                    onClick={() => updateParams({ status: params.status === st ? '' : st, page: 1 })}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium transition-all border capitalize',
                      active
                        ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                        : `border-transparent ${colors[st]} hover:border-slate-600`
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {(params.status || params.source || params.osCategory || params.search) && (
                <button
                  onClick={() => updateParams({ status: '', source: '', osCategory: '', search: '', page: 1 })}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Clear
                </button>
              )}
              <div className="flex items-center border border-slate-600 rounded overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'p-1.5 transition-colors',
                    viewMode === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-1.5 transition-colors',
                    viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Search + filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search FQDN or IP..."
                value={params.search}
                onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
              />
            </div>
            <select
              value={params.source}
              onChange={(e) => updateParams({ source: e.target.value, page: 1 })}
              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-400 appearance-none cursor-pointer"
            >
              <option value="">Source</option>
              <option value="satellite">Satellite</option>
              <option value="checkmk">Checkmk</option>
              <option value="dns">DNS</option>
              <option value="vcsa">vCSA</option>
            </select>
            <select
              value={params.osCategory}
              onChange={(e) => updateParams({ osCategory: e.target.value, page: 1 })}
              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-400 appearance-none cursor-pointer"
            >
              <option value="">OS Type</option>
              <option value="linux">Linux</option>
              <option value="windows">Windows</option>
              <option value="appliance">Appliance</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className={cn(isPlaceholderData && 'opacity-70 transition-opacity')}>
          {viewMode === 'table' ? (
            <DataTable
              columns={columns}
              data={hosts}
              loading={isLoading}
              sortBy={params.sortBy}
              sortDir={params.sortDir}
              onSort={handleSort}
              onRowClick={(host) => navigate(`/hosts/${encodeURIComponent(host.fqdn)}`)}
              rowKey={(host) => host.fqdn}
              emptyMessage="No hosts found matching your filters."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-slate-800 rounded-lg border border-slate-700 p-5 animate-pulse"
                    >
                      <div className="h-5 bg-slate-700 rounded w-3/4 mb-3" />
                      <div className="h-3 bg-slate-700 rounded w-1/2 mb-4" />
                      <div className="h-8 bg-slate-700 rounded w-full" />
                    </div>
                  ))
                : hosts.map((host) => {
                    const colors = scoreColor(host.complianceScore);
                    return (
                      <div
                        key={host.fqdn}
                        onClick={() => navigate(`/hosts/${encodeURIComponent(host.fqdn)}`)}
                        className="bg-slate-800 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-all duration-200 cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                              {host.fqdn}
                            </p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{host.ip}</p>
                          </div>
                          <StatusBadge status={host.status} size="sm" />
                        </div>

                        <p className="text-xs text-slate-400 mb-3">{host.os}</p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {host.sources.map((s) => (
                              <span
                                key={s}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          <span className={cn('text-xs font-medium', colors.text)}>
                            {host.complianceScore}%
                          </span>
                        </div>

                        <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', colors.bg)}
                            style={{ width: `${host.complianceScore}%` }}
                          />
                        </div>

                        <p className="text-xs text-slate-500 mt-3">
                          Last seen {formatRelative(host.lastSeen)}
                        </p>
                      </div>
                    );
                  })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-slate-400">
              Showing {((currentPage - 1) * (params.pageSize ?? 20)) + 1} to{' '}
              {Math.min(currentPage * (params.pageSize ?? 20), total)} of {total} hosts
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => updateParams({ page: currentPage - 1 })}
                disabled={currentPage <= 1}
                className="btn-ghost flex items-center gap-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={page}
                      onClick={() => updateParams({ page })}
                      className={cn(
                        'w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200',
                        page === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                      )}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => updateParams({ page: currentPage + 1 })}
                disabled={currentPage >= totalPages}
                className="btn-ghost flex items-center gap-1 disabled:opacity-30"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
