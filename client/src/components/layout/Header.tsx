import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { triggerSync, getDashboard } from '@/lib/api';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncStatus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });

  const discrepancyCount = dashboard?.discrepancyCount ?? 0;

  return (
    <header className="h-16 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-40">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Discrepancy Notification */}
        {discrepancyCount > 0 && (
          <button
            onClick={() => navigate('/discrepancies')}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400 font-medium">
              {discrepancyCount} discrepanc{discrepancyCount === 1 ? 'y' : 'ies'}
            </span>
          </button>
        )}

        {/* Sync Button */}
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className={cn(
            'btn-primary flex items-center gap-2 text-sm',
            syncMutation.isPending && 'opacity-75'
          )}
        >
          <RefreshCw
            className={cn(
              'w-4 h-4',
              syncMutation.isPending && 'animate-spin'
            )}
          />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </header>
  );
}
