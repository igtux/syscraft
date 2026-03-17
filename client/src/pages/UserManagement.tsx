import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCog,
  Plus,
  Trash2,
  X,
  Pencil,
  Loader2,
  Shield,
  Users as UsersIcon,
  Lock,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn, formatRelative } from '@/lib/utils';
import {
  getUsers,
  getHostGroups,
  createUser,
  updateUser,
  deleteUser,
  type ManagedUser,
  type HostGroup,
} from '@/lib/api';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);

  const { data: usersRes, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const users = usersRes?.data ?? [];

  return (
    <div>
      <Header title="User Management" subtitle="Manage users, roles, and host group assignments" />

      <div className="p-6 space-y-4">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load users.
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            New User
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="bg-slate-800 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      u.role === 'admin' ? 'bg-blue-600/20' : 'bg-slate-700'
                    )}>
                      <span className={cn(
                        'text-sm font-bold',
                        u.role === 'admin' ? 'text-blue-400' : 'text-slate-400'
                      )}>
                        {u.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{u.username}</h3>
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                          u.role === 'admin'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-slate-700 text-slate-400 border border-slate-600'
                        )}>
                          <Shield className="w-3 h-3" />
                          {u.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setEditUser(u)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                      title="Edit user"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete user "${u.username}"?`)) {
                          deleteMutation.mutate(u.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Host Groups */}
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <UsersIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs text-slate-500 font-medium">Host Groups</span>
                  </div>
                  {u.hostGroups.length === 0 ? (
                    <p className="text-xs text-red-400">No host groups assigned — user cannot see any hosts</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {u.hostGroups.map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300 border border-slate-600/50"
                        >
                          {g.system && <Lock className="w-3 h-3 text-slate-500" />}
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Created {formatRelative(u.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: groupsRes } = useQuery({ queryKey: ['hostGroups'], queryFn: getHostGroups });
  const groups = groupsRes?.data ?? [];

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (err: any) => { setErrorMsg(err?.response?.data?.error || 'Failed to create user.'); },
  });

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (!username.trim()) { setErrorMsg('Username is required.'); return; }
    if (!email.trim()) { setErrorMsg('Email is required.'); return; }
    if (password.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setErrorMsg('');
    createMutation.mutate({
      username: username.trim(),
      email: email.trim(),
      password,
      role,
      hostGroupIds: selectedGroupIds,
    });
  };

  return (
    <ModalShell title="New User" onClose={onClose}>
      <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{errorMsg}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-field w-full" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field w-full" placeholder="Min 6 characters" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input-field w-full appearance-none cursor-pointer">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <HostGroupPicker groups={groups} selectedIds={selectedGroupIds} onToggle={toggleGroup} />
      </div>
      <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-end gap-3">
        <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={createMutation.isPending} className="btn-primary flex items-center gap-2 text-sm">
          {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Create User</>}
        </button>
      </div>
    </ModalShell>
  );
}

function EditUserModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(user.role);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(user.hostGroups.map((g) => g.id));
  const [errorMsg, setErrorMsg] = useState('');

  const { data: groupsRes } = useQuery({ queryKey: ['hostGroups'], queryFn: getHostGroups });
  const groups = groupsRes?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateUser>[1]) => updateUser(user.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (err: any) => { setErrorMsg(err?.response?.data?.error || 'Failed to update user.'); },
  });

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (password && password.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setErrorMsg('');
    updateMutation.mutate({
      role,
      email: email.trim(),
      ...(password ? { password } : {}),
      hostGroupIds: selectedGroupIds,
    });
  };

  return (
    <ModalShell title={`Edit "${user.username}"`} onClose={onClose}>
      <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{errorMsg}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field w-full" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')} className="input-field w-full appearance-none cursor-pointer">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">New Password <span className="text-slate-500 font-normal">(leave blank to keep current)</span></label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field w-full" placeholder="Min 6 characters" />
        </div>
        <HostGroupPicker groups={groups} selectedIds={selectedGroupIds} onToggle={toggleGroup} />
      </div>
      <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-end gap-3">
        <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={updateMutation.isPending} className="btn-primary flex items-center gap-2 text-sm">
          {updateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Save Changes'}
        </button>
      </div>
    </ModalShell>
  );
}

function HostGroupPicker({ groups, selectedIds, onToggle }: { groups: HostGroup[]; selectedIds: number[]; onToggle: (id: number) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-300">
        Host Groups <span className="text-slate-500 font-normal">({selectedIds.length} assigned)</span>
      </label>
      <p className="text-xs text-slate-500">User will only see hosts in their assigned groups.</p>
      <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700/50">
        {groups.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No host groups available</p>
        ) : groups.map((g) => (
          <label
            key={g.id}
            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700/30 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(g.id)}
              onChange={() => onToggle(g.id)}
              className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
            />
            <div className="flex items-center gap-2 min-w-0">
              {g.system && <Lock className="w-3 h-3 text-slate-500 flex-shrink-0" />}
              <span className="text-sm text-slate-300 truncate">{g.name}</span>
              <span className="text-xs text-slate-500">{g.hostCount} hosts</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg"><UserCog className="w-5 h-5 text-blue-400" /></div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
