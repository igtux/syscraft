import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/layout/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Hosts from '@/pages/Hosts';
import HostDetail from '@/pages/HostDetail';
import Recommendations from '@/pages/Recommendations';
import Compliance from '@/pages/Compliance';
import HostGroups from '@/pages/HostGroups';
import UserManagement from '@/pages/UserManagement';
import Settings from '@/pages/Settings';
import HostCollections from '@/pages/HostCollections';
import Spinner from '@/components/ui/Spinner';

function App() {
  const { isAuthenticated, isLoading, login, logout, user } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-400 text-sm">Loading SysCraft...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  const isAdmin = user?.role === 'admin';

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hosts" element={<Hosts />} />
        <Route path="/hosts/:fqdn" element={<HostDetail />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/discrepancies" element={<Navigate to="/recommendations" replace />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/host-groups" element={<HostGroups />} />
        <Route path="/users" element={isAdmin ? <UserManagement /> : <Navigate to="/" replace />} />
        <Route path="/collections" element={isAdmin ? <HostCollections /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={isAdmin ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
