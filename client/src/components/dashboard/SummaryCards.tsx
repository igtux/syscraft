import { Server, CheckCircle, ClipboardCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  totalHosts: number;
  activeHosts: number;
  recommendations: number;
  staleHosts: number;
  loading?: boolean;
}

const cards = [
  {
    key: 'total',
    label: 'Total Hosts',
    icon: Server,
    color: 'blue',
    gradientFrom: 'from-blue-600/10',
    gradientTo: 'to-blue-400/5',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    borderColor: 'border-blue-500/20',
  },
  {
    key: 'active',
    label: 'Active Hosts',
    icon: CheckCircle,
    color: 'green',
    gradientFrom: 'from-green-600/10',
    gradientTo: 'to-green-400/5',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    borderColor: 'border-green-500/20',
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    icon: ClipboardCheck,
    color: 'amber',
    gradientFrom: 'from-amber-600/10',
    gradientTo: 'to-amber-400/5',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/20',
  },
  {
    key: 'stale',
    label: 'Stale Hosts',
    icon: Clock,
    color: 'red',
    gradientFrom: 'from-red-600/10',
    gradientTo: 'to-red-400/5',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
    borderColor: 'border-red-500/20',
  },
] as const;

function getCardValue(
  key: string,
  props: SummaryCardsProps
): number {
  switch (key) {
    case 'total':
      return props.totalHosts;
    case 'active':
      return props.activeHosts;
    case 'recommendations':
      return props.recommendations;
    case 'stale':
      return props.staleHosts;
    default:
      return 0;
  }
}

export default function SummaryCards(props: SummaryCardsProps) {
  const { loading } = props;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = getCardValue(card.key, props);

        return (
          <div
            key={card.key}
            className={cn(
              'relative overflow-hidden rounded-lg border bg-gradient-to-br p-6',
              'bg-slate-800',
              card.borderColor,
              card.gradientFrom,
              card.gradientTo,
              'animate-fade-in'
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">{card.label}</p>
                {loading ? (
                  <div className="h-9 w-20 bg-slate-700 rounded animate-pulse mt-2" />
                ) : (
                  <p className="text-3xl font-bold text-white mt-1 tabular-nums">
                    {value.toLocaleString()}
                  </p>
                )}
              </div>
              <div className={cn('p-3 rounded-lg', card.iconBg)}>
                <Icon className={cn('w-6 h-6', card.iconColor)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
