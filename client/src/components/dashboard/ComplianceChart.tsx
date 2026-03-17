import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DonutEntry {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  subtitle: string;
  data: DonutEntry[];
  centerValue: string;
  centerLabel: string;
  loading?: boolean;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { name: string; value: number; fill: string };
  }>;
  unit?: string;
}

function CustomTooltip({ active, payload, unit }: ChartTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 shadow-lg">
        <p className="text-sm text-white font-medium">{payload[0].name}</p>
        <p className="text-sm text-slate-300">
          {payload[0].value} {unit || 'hosts'}
        </p>
      </div>
    );
  }
  return null;
}

function DonutChart({ title, subtitle, data, centerValue, centerLabel, loading }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        <div className="flex items-center justify-center h-44 mt-3">
          <div className="w-32 h-32 rounded-full bg-slate-700 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>

      <div className="flex flex-col items-center mt-2">
        <div className="relative w-full h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip unit={title.includes('Agent') ? 'agents' : 'hosts'} />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{centerValue}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{centerLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[11px] text-slate-400">
                {entry.name}{' '}
                <span className="text-slate-300 font-medium">
                  {total > 0 ? Math.round((entry.value / total) * 100) : 0}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ComplianceChartsProps {
  hostCompliance: {
    bothSystems: number;
    onlyOne: number;
    none: number;
    percent: number;
  };
  agentCompliance: {
    installed: number;
    absent: number;
    percent: number;
  };
  overallScore: number;
  activeHosts: number;
  partialHosts: number;
  staleHosts: number;
  totalHosts: number;
  loading?: boolean;
}

export default function ComplianceCharts({
  hostCompliance,
  agentCompliance,
  overallScore,
  activeHosts,
  partialHosts,
  staleHosts,
  totalHosts,
  loading,
}: ComplianceChartsProps) {
  const newHosts = totalHosts - activeHosts - partialHosts - staleHosts;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <DonutChart
        title="Host Compliance"
        subtitle="Presence across systems"
        data={[
          { name: 'Both Systems', value: hostCompliance.bothSystems, color: '#22c55e' },
          { name: 'One System', value: hostCompliance.onlyOne, color: '#f59e0b' },
          { name: 'No System', value: hostCompliance.none, color: '#ef4444' },
        ]}
        centerValue={`${hostCompliance.percent}%`}
        centerLabel="registered"
        loading={loading}
      />

      <DonutChart
        title="Agent Compliance"
        subtitle="Required agents installed"
        data={[
          { name: 'Installed', value: agentCompliance.installed, color: '#22c55e' },
          { name: 'Absent', value: agentCompliance.absent, color: '#ef4444' },
        ]}
        centerValue={`${agentCompliance.percent}%`}
        centerLabel="installed"
        loading={loading}
      />

      <DonutChart
        title="Total Compliance"
        subtitle="Overall host status"
        data={[
          { name: 'Active', value: activeHosts, color: '#22c55e' },
          { name: 'Partial', value: partialHosts, color: '#f59e0b' },
          { name: 'Stale', value: staleHosts, color: '#ef4444' },
          ...(newHosts > 0 ? [{ name: 'New', value: newHosts, color: '#6366f1' }] : []),
        ]}
        centerValue={`${overallScore}%`}
        centerLabel="compliant"
        loading={loading}
      />
    </div>
  );
}
