import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/lib/api';
import Header from '@/components/layout/Header';
import SummaryCards from '@/components/dashboard/SummaryCards';
import ComplianceCharts from '@/components/dashboard/ComplianceChart';
import RecentEvents from '@/components/dashboard/RecentEvents';
import SystemStatus from '@/components/dashboard/SystemStatus';

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
          </div>
        </div>
      </div>
    </div>
  );
}
