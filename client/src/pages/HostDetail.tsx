import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Server,
  Globe,
  Monitor,
  Cpu,
  MemoryStick,
  CalendarDays,
  Clock,
  Shield,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  Package,
  Bug,
  Zap,
  Wifi,
  Activity,
  ClipboardCheck,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Spinner from '@/components/ui/Spinner';
import CommandBlock from '@/components/ui/CommandBlock';
import { cn, formatDate, formatRelative, scoreColor, severityColor } from '@/lib/utils';
import { getHost, type HostDetail as HostDetailType, type Recommendation } from '@/lib/api';

function OsBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    linux: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    windows: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    appliance: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    unknown: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium border capitalize', colors[category] || colors.unknown)}>
      {category}
    </span>
  );
}

function LivenessDot({ alive, confidence }: { alive: boolean; confidence: string }) {
  if (confidence === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5" title="No liveness data">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
        <span className="text-xs text-slate-500">Unknown</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" title={alive ? 'Host is alive' : 'Host is unreachable'}>
      <span className={cn(
        'w-2.5 h-2.5 rounded-full',
        alive ? 'bg-green-400 animate-pulse' : 'bg-red-400'
      )} />
      <span className={cn('text-xs', alive ? 'text-green-400' : 'text-red-400')}>
        {alive ? 'Alive' : 'Unreachable'}
      </span>
    </span>
  );
}

export default function HostDetail() {
  const { fqdn } = useParams<{ fqdn: string }>();
  const navigate = useNavigate();

  const { data: host, isLoading, error } = useQuery({
    queryKey: ['host', fqdn],
    queryFn: () => getHost(fqdn!),
    enabled: !!fqdn,
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Host Detail" />
        <div className="p-6 flex items-center justify-center min-h-96">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !host) {
    return (
      <div>
        <Header title="Host Detail" />
        <div className="p-6">
          <button
            onClick={() => navigate('/hosts')}
            className="btn-ghost flex items-center gap-2 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Hosts
          </button>
          <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-400">Failed to load host details.</p>
            <p className="text-sm text-slate-400 mt-1">The host may not exist or there was a network error.</p>
          </div>
        </div>
      </div>
    );
  }

  const sc = scoreColor(host.complianceScore);

  return (
    <div>
      <Header title={host.fqdn} />

      <div className="p-6 space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/hosts')}
          className="btn-ghost flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Hosts
        </button>

        {/* Host Header */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600/20 rounded-xl">
                <Server className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{host.fqdn}</h2>
                <p className="text-slate-400 font-mono text-sm mt-0.5">{host.ip}</p>
                <div className="flex items-center gap-3 mt-2">
                  <StatusBadge status={host.status} />
                  <OsBadge category={host.osCategory} />
                  {host.liveness && (
                    <LivenessDot alive={host.liveness.alive} confidence={host.liveness.confidence} />
                  )}
                  <div className="flex items-center gap-1.5">
                    {host.sources.map((source) => (
                      <span
                        key={source}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300 border border-slate-600/50"
                      >
                        {source === 'satellite' ? (
                          <Globe className="w-3 h-3 text-blue-400" />
                        ) : source === 'dns' ? (
                          <Wifi className="w-3 h-3 text-purple-400" />
                        ) : (
                          <Monitor className="w-3 h-3 text-green-400" />
                        )}
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance Score Circle */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center ring-4',
                sc.ring,
                'bg-slate-700/50'
              )}>
                <span className={cn('text-2xl font-bold', sc.text)}>
                  {host.complianceScore}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Compliance</p>
            </div>
          </div>
        </div>

        {/* Overview Section */}
        <Card title="Overview" subtitle="Core system information">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem
              icon={<Server className="w-4 h-4 text-slate-400" />}
              label="Operating System"
              value={host.os}
            />
            <InfoItem
              icon={<Cpu className="w-4 h-4 text-slate-400" />}
              label="Architecture"
              value={host.arch}
            />
            <InfoItem
              icon={<Shield className="w-4 h-4 text-slate-400" />}
              label="Kernel"
              value={host.satellite?.kernel ?? 'N/A'}
            />
            <InfoItem
              icon={<Cpu className="w-4 h-4 text-slate-400" />}
              label="CPU Cores"
              value={host.satellite?.cpuCount != null ? String(host.satellite.cpuCount) : 'N/A'}
            />
            <InfoItem
              icon={<MemoryStick className="w-4 h-4 text-slate-400" />}
              label="RAM"
              value={host.satellite?.ramMb != null ? `${Math.round(host.satellite.ramMb / 1024 * 10) / 10} GB` : 'N/A'}
            />
            <InfoItem
              icon={<CalendarDays className="w-4 h-4 text-slate-400" />}
              label="Created"
              value={host.satellite?.createdAt ? formatDate(host.satellite.createdAt) : 'N/A'}
            />
            <InfoItem
              icon={<Clock className="w-4 h-4 text-slate-400" />}
              label="Last Seen"
              value={formatRelative(host.lastSeen)}
            />
            <InfoItem
              icon={<Activity className="w-4 h-4 text-slate-400" />}
              label="Last Ping"
              value={host.lastPingAt ? formatRelative(host.lastPingAt) : 'Never'}
            />
          </div>
        </Card>

        {/* Liveness Section */}
        {host.liveness && host.liveness.signals.length > 0 && (
          <Card title="Liveness" subtitle="Multi-source health signals">
            <div className="space-y-2">
              {host.liveness.signals.map((signal, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    signal.alive
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      signal.alive ? 'bg-green-400' : 'bg-red-400'
                    )} />
                    <div>
                      <p className="text-sm font-medium text-white capitalize">{signal.source}</p>
                      <p className="text-xs text-slate-400">{signal.detail}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{formatRelative(signal.timestamp)}</span>
                </div>
              ))}
              {host.liveness.deadSinceDays !== null && (
                <p className="text-xs text-red-400 mt-2">
                  Unreachable for {host.liveness.deadSinceDays} day(s)
                </p>
              )}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Satellite Data */}
          <SatelliteSection data={host.satellite} />

          {/* Checkmk Data */}
          <CheckmkSection data={host.checkmk} />
        </div>

        {/* DNS Data */}
        <DnsSection data={host.dns} />

        {/* Agent Compliance */}
        <AgentComplianceSection agents={host.agents} />

        {/* Recommendations */}
        <RecommendationsSection recommendations={host.recommendations} />
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 bg-slate-700/20 rounded-lg border border-slate-700/50">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-sm text-white font-medium truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function SatelliteSection({ data }: { data: HostDetailType['satellite'] }) {
  if (!data) {
    return (
      <Card title="Satellite" subtitle="Red Hat Satellite registration">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Globe className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Not registered in Satellite</p>
        </div>
      </Card>
    );
  }

  const errataTotal = data.errata.security + data.errata.bugfix + data.errata.enhancement;

  return (
    <Card title="Satellite" subtitle="Red Hat Satellite registration">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Subscription" value={data.subscriptionStatus} />
          <DetailField label="Host Group" value={data.hostGroup} />
          <DetailField label="Content View" value={data.contentView} />
          <DetailField label="Lifecycle Env" value={data.lifecycleEnv} />
          <DetailField label="Organization" value={data.organization} />
          <DetailField label="Last Checkin" value={formatDate(data.lastCheckin)} />
          <DetailField label="Created" value={formatDate(data.createdAt)} />
        </div>

        <div className="border-t border-slate-700/50 pt-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Errata</p>
          <div className="grid grid-cols-4 gap-2">
            <ErrataCard
              icon={<Package className="w-4 h-4" />}
              label="Total"
              count={errataTotal}
              color="text-slate-300"
            />
            <ErrataCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Security"
              count={data.errata.security}
              color="text-red-400"
            />
            <ErrataCard
              icon={<Bug className="w-4 h-4" />}
              label="Bugfix"
              count={data.errata.bugfix}
              color="text-amber-400"
            />
            <ErrataCard
              icon={<Zap className="w-4 h-4" />}
              label="Enhance"
              count={data.errata.enhancement}
              color="text-blue-400"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function CheckmkSection({ data }: { data: HostDetailType['checkmk'] }) {
  if (!data) {
    return (
      <Card title="Checkmk" subtitle="Monitoring status">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Monitor className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Not monitored in Checkmk</p>
        </div>
      </Card>
    );
  }

  const totalServices = data.services.ok + data.services.warn + data.services.crit + data.services.unknown + data.services.pending;

  return (
    <Card title="Checkmk" subtitle="Monitoring status">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Status" value={data.status} />
          <DetailField label="Agent Type" value={data.agentType} />
          <DetailField label="Last Contact" value={formatRelative(data.lastContact)} />
          <DetailField label="Total Services" value={String(totalServices)} />
        </div>

        <div className="border-t border-slate-700/50 pt-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Service Breakdown</p>
          <div className="grid grid-cols-4 gap-2">
            <ServiceCard label="OK" count={data.services.ok} color="text-green-400" bg="bg-green-500/10" />
            <ServiceCard label="Warning" count={data.services.warn} color="text-amber-400" bg="bg-amber-500/10" />
            <ServiceCard label="Critical" count={data.services.crit} color="text-red-400" bg="bg-red-500/10" />
            <ServiceCard label="Unknown" count={data.services.unknown} color="text-slate-400" bg="bg-slate-500/10" />
          </div>

          {totalServices > 0 && (
            <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden flex">
              <div
                className="bg-green-500 h-full"
                style={{ width: `${(data.services.ok / totalServices) * 100}%` }}
              />
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${(data.services.warn / totalServices) * 100}%` }}
              />
              <div
                className="bg-red-500 h-full"
                style={{ width: `${(data.services.crit / totalServices) * 100}%` }}
              />
              <div
                className="bg-slate-500 h-full"
                style={{ width: `${(data.services.unknown / totalServices) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DnsSection({ data }: { data: HostDetailType['dns'] }) {
  if (!data) {
    return (
      <Card title="DNS" subtitle="Forward and reverse record validation">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Wifi className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No DNS data available</p>
          <p className="text-xs text-slate-500 mt-1">Enable DNS checking in Settings to validate records</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="DNS" subtitle="Forward and reverse record validation">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Forward (A) IP" value={data.forwardIp || 'No A record'} />
          <DetailField label="Reverse (PTR) Hostname" value={data.reverseHostname || 'No PTR record'} />
          <div>
            <p className="text-xs text-slate-400 font-medium">Forward Match</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {data.forwardMatch ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className={cn('text-sm font-medium', data.forwardMatch ? 'text-green-400' : 'text-red-400')}>
                {data.forwardMatch ? 'Matches known IP' : 'Mismatch or missing'}
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Reverse Match</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {data.reverseMatch ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className={cn('text-sm font-medium', data.reverseMatch ? 'text-green-400' : 'text-red-400')}>
                {data.reverseMatch ? 'Matches FQDN' : 'Mismatch or missing'}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-xs text-slate-500">Last checked: {data.lastChecked ? formatRelative(data.lastChecked) : 'N/A'}</p>
        </div>
      </div>
    </Card>
  );
}

function AgentComplianceSection({ agents }: { agents: HostDetailType['agents'] }) {
  if (!agents || agents.length === 0) {
    return (
      <Card title="Agent Compliance" subtitle="Required agent checklist">
        <p className="text-slate-400 text-sm text-center py-6">No agent data available</p>
      </Card>
    );
  }

  return (
    <Card title="Agent Compliance" subtitle="Required agent checklist">
      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition-colors',
              agent.installed && agent.running
                ? 'bg-green-500/5 border-green-500/20'
                : agent.installed
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-red-500/5 border-red-500/20'
            )}
          >
            <div className="flex items-center gap-3">
              {agent.installed && agent.running ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : agent.installed ? (
                <MinusCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-white">{agent.name}</p>
                {agent.version && (
                  <p className="text-xs text-slate-400 font-mono">{agent.version}</p>
                )}
                {agent.packageName && (
                  <p className="text-xs text-slate-500 font-mono">{agent.packageName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className={cn(
                'px-2 py-0.5 rounded',
                agent.installed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              )}>
                {agent.installed ? 'Installed' : 'Not Installed'}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded',
                agent.running ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              )}>
                {agent.running ? 'Running' : 'Stopped'}
              </span>
              {agent.required && (
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  Required
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-amber-400" />
          <span>Recommendations</span>
          <span className="text-xs text-slate-500 font-normal">({recommendations.length})</span>
        </div>
      }
      subtitle="Actionable items for this host"
    >
      <div className="space-y-4">
        {recommendations.map((rec) => {
          const sevColors = severityColor(
            rec.severity === 'critical' ? 'high' : rec.severity === 'info' ? 'low' : (rec.severity as any)
          );
          return (
            <div key={rec.id} className="bg-slate-700/20 rounded-lg border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                  sevColors.bg, sevColors.text, sevColors.border
                )}>
                  {rec.severity}
                </span>
                <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-700/50 rounded">
                  {rec.type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
                <span className="text-xs text-slate-500">{rec.systemTarget}</span>
              </div>
              <p className="text-sm text-slate-300 mb-3">{rec.description}</p>
              {rec.commands.length > 0 && (
                <CommandBlock commands={rec.commands} compact />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-sm text-white mt-0.5 truncate" title={value}>{value}</p>
    </div>
  );
}

function ErrataCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div className="text-center p-2 bg-slate-700/30 rounded-lg">
      <div className={cn('flex items-center justify-center mb-1', color)}>{icon}</div>
      <p className={cn('text-lg font-bold', color)}>{count}</p>
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
    </div>
  );
}

function ServiceCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className={cn('text-center p-2 rounded-lg', bg)}>
      <p className={cn('text-lg font-bold', color)}>{count}</p>
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
    </div>
  );
}
