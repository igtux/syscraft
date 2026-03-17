import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  ClipboardCheck,
  Shield,
  FolderOpen,
  Users,
  UserCog,
  Settings,
  Cpu,
  LogOut,
  Circle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn, formatRelative } from '@/lib/utils';
import { getSyncStatus, type User } from '@/lib/api';

interface SidebarProps {
  user: User | null;
  onLogout: () => void;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { path: '/hosts', label: 'Host Inventory', icon: Server, adminOnly: false },
  { path: '/recommendations', label: 'Recommendations', icon: ClipboardCheck, adminOnly: false },
  { path: '/compliance', label: 'Agent Compliance', icon: Shield, adminOnly: false },
  { path: '/host-groups', label: 'Host Groups', icon: Users, adminOnly: false },
  { path: '/collections', label: 'Host Collections', icon: FolderOpen, adminOnly: true },
  { path: '/users', label: 'User Management', icon: UserCog, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const { data: syncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: getSyncStatus,
    refetchInterval: 30_000,
  });

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-700 flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-700/50">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 hover:opacity-80 active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <Cpu className="w-6 h-6 text-blue-400" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-white tracking-tight">SysCraft</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
              Infrastructure Source of Truth
            </p>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative',
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-400 rounded-r" />
              )}
              <Icon
                className={cn(
                  'w-5 h-5 flex-shrink-0 transition-colors',
                  active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                )}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Sync Status */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Circle
            className={cn(
              'w-2 h-2 flex-shrink-0',
              syncStatus?.lastSync ? 'fill-green-500 text-green-500' : 'fill-slate-600 text-slate-600'
            )}
          />
          <span>
            {syncStatus?.lastSync
              ? `Last sync ${formatRelative(syncStatus.lastSync.completedAt || syncStatus.lastSync.startedAt)}`
              : 'No sync data'}
          </span>
        </div>
      </div>

      {/* User Info + Logout */}
      <div className="px-4 py-4 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-blue-400">
                {user?.username?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {user?.username ?? 'User'}
              </p>
              <p className="text-xs text-slate-500 capitalize">{user?.role ?? 'viewer'}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-all duration-200"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
