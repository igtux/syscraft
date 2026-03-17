import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
}

export default function Card({
  title,
  subtitle,
  action,
  children,
  className,
  hover = false,
  padding = true,
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-slate-800 rounded-lg border border-slate-700',
        hover && 'hover:border-slate-600 transition-all duration-200 cursor-pointer',
        padding && 'p-6',
        className
      )}
    >
      {(title || action) && (
        <div className={cn('flex items-center justify-between', (title || subtitle) && 'mb-4')}>
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
