import { useQuery } from '@tanstack/react-query';
import { getDashboard, type VcsaInfrastructure } from '@/lib/api';
import { Server, HardDrive, Network, Power, PowerOff } from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import SummaryCards from '@/components/dashboard/SummaryCards';
import ComplianceCharts from '@/components/dashboard/ComplianceChart';
import RecentEvents from '@/components/dashboard/RecentEvents';
import SystemStatus from '@/components/dashboard/SystemStatus';
import { cn } from '@/lib/utils';

function InfrastructureCard({ infra }: { infra: VcsaInfrastructure }) {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400" />
          <span>vSphere Infrastructure</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* VM Summary */}
        <div className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Virtual Machines</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Power className="w-3 h-3" />
              {infra.vmPoweredOn} on
            </span>
            {infra.vmPoweredOff > 0 && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <PowerOff className="w-3 h-3" />
                {infra.vmPoweredOff} off
              </span>
            )}
          </div>
        </div>

        {/* ESXi Hosts */}
        {infra.esxiHosts.map((host) => (
          <div key={host.name} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-white font-medium">{host.name}</span>
            </div>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded',
              host.connectionState === 'CONNECTED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            )}>
              {host.connectionState}
            </span>
          </div>
        ))}

        {/* Datastores */}
        {infra.datastores.map((ds) => {
          const usedGb = Math.round((ds.capacityBytes - ds.freeSpaceBytes) / (1024 ** 3));
          const totalGb = Math.round(ds.capacityBytes / (1024 ** 3));
          const color = ds.usedPercent > 85 ? 'bg-red-500' : ds.usedPercent > 70 ? 'bg-amber-500' : 'bg-blue-500';
          return (
            <div key={ds.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs text-slate-300">{ds.name}</span>
                </div>
                <span className="text-xs text-slate-500">{usedGb}GB / {totalGb}GB ({ds.usedPercent}%)</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${ds.usedPercent}%` }} />
              </div>
            </div>
          );
        })}

        {/* Networks */}
        <div className="flex flex-wrap gap-2">
          {infra.networks.map((net) => (
            <span key={net.name} className="flex items-center gap-1 text-xs text-slate-400 px-2 py-1 bg-slate-700/30 rounded">
              <Network className="w-3 h-3" />
              {net.name}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 60_000,
  });

  const defaultHostCompliance = { bothSystems: 0, onlyOne: 0, none: 0, percent: 0 };
  const defaultAgentCompliance = { installed: 0, absent: 0, percent: 0 };

  return (
    <div>
      <Header title="Dashboard" subtitle="Infrastructure overview at a glance" />

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load dashboard data. Please try again.
          </div>
        )}

        {/* Summary Cards */}
        <SummaryCards
          totalHosts={data?.totalHosts ?? 0}
          activeHosts={data?.activeHosts ?? 0}
          recommendations={data?.recommendationSummary?.total ?? data?.discrepancyCount ?? 0}
          staleHosts={data?.staleHosts ?? 0}
          loading={isLoading}
        />

        {/* Compliance Charts Row */}
        <ComplianceCharts
          hostCompliance={data?.hostCompliance ?? defaultHostCompliance}
          agentCompliance={data?.agentCompliance ?? defaultAgentCompliance}
          overallScore={data?.complianceAverage ?? 0}
          activeHosts={data?.activeHosts ?? 0}
          partialHosts={data?.partialHosts ?? 0}
          staleHosts={data?.staleHosts ?? 0}
          totalHosts={data?.totalHosts ?? 0}
          loading={isLoading}
        />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="xl:col-span-2 space-y-6">
            <RecentEvents
              events={data?.recentEvents ?? []}
              loading={isLoading}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <SystemStatus
              sources={data?.systemStatuses ?? []}
              loading={isLoading}
            />
            {data?.vcsaInfrastructure && (
              <InfrastructureCard infra={data.vcsaInfrastructure} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
