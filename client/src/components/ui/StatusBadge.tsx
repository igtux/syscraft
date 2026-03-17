import { cn, statusColor, capitalize } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'active' | 'partial' | 'stale' | 'new' | 'decommissioning';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colors = statusColor(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        colors.bg,
        colors.text,
        colors.border,
        'border',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      <span
        className={cn(
          'rounded-full',
          colors.dot,
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
        )}
      />
      {capitalize(status)}
    </span>
  );
}
