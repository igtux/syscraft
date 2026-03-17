import { type ReactNode } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { type User } from '@/lib/api';

interface LayoutProps {
  children: ReactNode;
  user: User | null;
  onLogout: () => void;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  return (
    <div className="min-h-screen bg-slate-900">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
