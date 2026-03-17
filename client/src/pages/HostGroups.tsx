import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Trash2,
  X,
  UserPlus,
  UserMinus,
  Loader2,
  Server,
  Lock,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  getHostGroups,
  getHosts,
  createHostGroup,
  deleteHostGroup,
  addHostsToGroup,
  removeHostsFromGroup,
  type HostGroup,
} from '@/lib/api';

export default function HostGroups() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showCreate, setShowCreate] = useState(false);
  const [manageId, setManageId] = useState<number | null>(null);

  const { data: groupsRes, isLoading, error } = useQuery({
    queryKey: ['hostGroups'],
    queryFn: getHostGroups,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHostGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostGroups'] }),
  });

  const groups = groupsRes?.data ?? [];
  const managed = groups.find((g) => g.id === manageId) ?? null;

  return (
    <div>
      <Header title="Host Groups" subtitle="Organize hosts into logical groups" />

      <div className="p-6 space-y-4">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load host groups.
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              New Group
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : groups.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No host groups</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groups.map((group) => (
              <div
                key={group.id}
                className="bg-slate-800 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-indigo-500/10 rounded-lg flex-shrink-0">
                      <Users className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{group.name}</h3>
                      {group.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{group.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {group.system && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400 border border-slate-600/50">
                        <Lock className="w-3 h-3" />
                        System
                      </span>
                    )}
                    {isAdmin && !group.system && (
                      <>
                        <button
                          onClick={() => setManageId(group.id)}
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                          title="Manage hosts"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete group "${group.name}"?`)) {
                              deleteMutation.mutate(group.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Delete group"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    {group.hostCount} host{group.hostCount !== 1 ? 's' : ''}
                  </span>
                  <span>Created {formatRelative(group.createdAt)}</span>
                </div>

                {group.hosts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {group.hosts.slice(0, 8).map((h) => (
                      <button
                        key={h.fqdn}
                        onClick={() => navigate(`/hosts/${encodeURIComponent(h.fqdn)}`)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-blue-400 hover:text-blue-300 border border-slate-600/50 transition-colors"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.status === 'active' ? 'bg-green-400' : h.status === 'partial' ? 'bg-amber-400' : h.status === 'stale' ? 'bg-red-400' : 'bg-blue-400'}`} />
                        {h.fqdn}
                      </button>
                    ))}
                    {group.hosts.length > 8 && (
                      <span className="px-2 py-0.5 text-xs text-slate-500">+{group.hosts.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
      {managed && <ManageGroupModal group={managed} onClose={() => setManageId(null)} />}
    </div>
  );
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const createMutation = useMutation({
    mutationFn: createHostGroup,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hostGroups'] }); onClose(); },
    onError: (err: any) => { setErrorMsg(err?.response?.data?.error || 'Failed to create group.'); },
  });

  const handleSubmit = () => {
    if (!name.trim()) { setErrorMsg('Name is required.'); return; }
    setErrorMsg('');
    createMutation.mutate({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">New Host Group</h2>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{errorMsg}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" placeholder="e.g. web-servers, db-tier" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field w-full" placeholder="Optional description" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={createMutation.isPending} className="btn-primary flex items-center gap-2 text-sm">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Create Group</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageGroupModal({ group, onClose }: { group: HostGroup; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: allHostsRes } = useQuery({
    queryKey: ['hosts', { page: 1, pageSize: 500 }],
    queryFn: () => getHosts({ page: 1, pageSize: 500 }),
  });

  const allHosts = allHostsRes?.data ?? [];
  const memberFqdns = new Set(group.hosts.map((h) => h.fqdn));

  const addMutation = useMutation({
    mutationFn: (fqdns: string[]) => addHostsToGroup(group.id, fqdns),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostGroups'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (fqdns: string[]) => removeHostsFromGroup(group.id, fqdns),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostGroups'] }),
  });

  const inGroup = allHosts.filter((h) => memberFqdns.has(h.fqdn));
  const available = allHosts.filter((h) => !memberFqdns.has(h.fqdn));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-semibold text-white">{group.name}</h2>
            <p className="text-xs text-slate-400">{group.hostCount} host{group.hostCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">Current Members</p>
            {inGroup.length === 0 ? (
              <p className="text-sm text-slate-500 p-3 bg-slate-700/20 rounded-lg">No hosts in this group</p>
            ) : (
              <div className="border border-slate-700 rounded-lg divide-y divide-slate-700/50">
                {inGroup.map((h) => (
                  <div key={h.fqdn} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-slate-300 truncate">{h.fqdn}</span>
                    <button onClick={() => removeMutation.mutate([h.fqdn])} disabled={removeMutation.isPending} className="p-1 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0" title="Remove">
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {available.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">Available Hosts</p>
              <div className="border border-slate-700 rounded-lg divide-y divide-slate-700/50">
                {available.map((h) => (
                  <div key={h.fqdn} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-slate-400 truncate">{h.fqdn}</span>
                    <button onClick={() => addMutation.mutate([h.fqdn])} disabled={addMutation.isPending} className="p-1 text-slate-500 hover:text-green-400 transition-colors flex-shrink-0" title="Add">
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
