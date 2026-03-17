import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Plus,
  Trash2,
  Server,
  X,
  UserPlus,
  UserMinus,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn, formatRelative } from '@/lib/utils';
import {
  getHostCollections,
  getOrganizations,
  getSatelliteHosts,
  getBaselines,
  getHostsMissingAgent,
  createHostCollection,
  deleteHostCollection,
  addHostsToCollection,
  removeHostsFromCollection,
  type HostCollection,
  type SatelliteHost,
  type Baseline,
  type MissingAgentHost,
} from '@/lib/api';

export default function HostCollections() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showFromAgent, setShowFromAgent] = useState(false);
  const [manageId, setManageId] = useState<number | null>(null);

  const { data: collectionsRes, isLoading, error } = useQuery({
    queryKey: ['hostCollections'],
    queryFn: getHostCollections,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHostCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostCollections'] }),
  });

  const collections = collectionsRes?.data ?? [];
  const managed = collections.find((c) => c.id === manageId) ?? null;

  return (
    <div>
      <Header title="Host Collections" subtitle="Manage Satellite host collections for bulk operations" />

      <div className="p-6 space-y-4">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load host collections. Ensure Satellite is reachable.
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{collections.length} collection{collections.length !== 1 ? 's' : ''} in Satellite</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFromAgent(true)} className="btn-ghost flex items-center gap-2 text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10">
              <ShieldAlert className="w-4 h-4" />
              From Missing Agent
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              New Collection
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : collections.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No host collections</p>
              <p className="text-sm text-slate-500 mt-1">Create a collection to group hosts for bulk agent installs via Satellite.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {collections.map((col) => (
              <div
                key={col.id}
                className="bg-slate-800 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-blue-500/10 rounded-lg flex-shrink-0">
                      <FolderOpen className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{col.name}</h3>
                      {col.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{col.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setManageId(col.id)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                      title="Manage hosts"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete collection "${col.name}"?`)) {
                          deleteMutation.mutate(col.id);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                      title="Delete collection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    {col.totalHosts} host{col.totalHosts !== 1 ? 's' : ''}
                  </span>
                  <span>Created {formatRelative(col.createdAt)}</span>
                </div>

                {col.hostFqdns.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {col.hostFqdns.slice(0, 6).map((fqdn) => (
                      <button
                        key={fqdn}
                        onClick={() => navigate(`/hosts/${encodeURIComponent(fqdn)}`)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-blue-400 hover:text-blue-300 border border-slate-600/50 transition-colors"
                      >
                        {fqdn}
                      </button>
                    ))}
                    {col.hostFqdns.length > 6 && (
                      <span className="px-2 py-0.5 text-xs text-slate-500">+{col.hostFqdns.length - 6} more</span>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <a
                    href={`https://satellite.ailab.local/host_collections/${col.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in Satellite
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {showFromAgent && <FromAgentModal onClose={() => setShowFromAgent(false)} />}
      {managed && <ManageHostsModal collection={managed} onClose={() => setManageId(null)} />}
    </div>
  );
}

/* ── Create (manual) ────────────────────────────────────────── */

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [orgId, setOrgId] = useState<number>(0);
  const [selectedHostIds, setSelectedHostIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: orgsRes } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations });
  const { data: hostsRes } = useQuery({ queryKey: ['satelliteHosts'], queryFn: getSatelliteHosts });

  const orgs = orgsRes?.data ?? [];
  const hosts = hostsRes?.data ?? [];

  if (orgId === 0 && orgs.length > 0) setOrgId(orgs[0].id);

  const createMutation = useMutation({
    mutationFn: createHostCollection,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hostCollections'] }); onClose(); },
    onError: (err: any) => { setErrorMsg(err?.response?.data?.error || 'Failed to create collection.'); },
  });

  const handleSubmit = () => {
    if (!name.trim()) { setErrorMsg('Name is required.'); return; }
    if (!orgId) { setErrorMsg('Organization is required.'); return; }
    setErrorMsg('');
    createMutation.mutate({ name: name.trim(), description: description.trim(), organizationId: orgId, hostIds: selectedHostIds });
  };

  const toggleHost = (id: number) => setSelectedHostIds((prev) => prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">New Host Collection</h2>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{errorMsg}</div>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" placeholder="e.g. web-servers, db-tier" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field w-full" placeholder="Optional description" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Organization</label>
            <select value={orgId} onChange={(e) => setOrgId(parseInt(e.target.value, 10))} className="input-field w-full appearance-none cursor-pointer">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Hosts <span className="text-slate-500 font-normal">({selectedHostIds.length} selected)</span></label>
            <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700/50">
              {hosts.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No Satellite hosts found</p>
              ) : hosts.map((h) => (
                <label key={h.satelliteId} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700/30 cursor-pointer transition-colors">
                  <input type="checkbox" checked={selectedHostIds.includes(h.satelliteId)} onChange={() => toggleHost(h.satelliteId)} className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50" />
                  <span className="text-sm text-slate-300 truncate">{h.fqdn}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={createMutation.isPending} className="btn-primary flex items-center gap-2 text-sm">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Create Collection</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Create from missing agent ──────────────────────────────── */

function FromAgentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [orgId, setOrgId] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: baselinesRes } = useQuery({ queryKey: ['baselines'], queryFn: getBaselines });
  const { data: orgsRes } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations });

  const baselines = baselinesRes?.data ?? [];
  const orgs = orgsRes?.data ?? [];
  if (orgId === 0 && orgs.length > 0) setOrgId(orgs[0].id);

  // Fetch hosts missing the selected agent
  const { data: missingRes, isLoading: missingLoading } = useQuery({
    queryKey: ['missingAgent', selectedAgent],
    queryFn: () => getHostsMissingAgent(selectedAgent),
    enabled: !!selectedAgent,
  });

  const missingHosts = missingRes?.data ?? [];
  const selectedBaseline = baselines.find((b) => b.name === selectedAgent);

  const createMutation = useMutation({
    mutationFn: createHostCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostCollections'] });
      onClose();
    },
    onError: (err: any) => { setErrorMsg(err?.response?.data?.error || 'Failed to create collection.'); },
  });

  const handleCreate = () => {
    if (!selectedAgent) { setErrorMsg('Select an agent first.'); return; }
    if (missingHosts.length === 0) { setErrorMsg('No hosts missing this agent.'); return; }
    if (!orgId) { setErrorMsg('Organization is required.'); return; }
    setErrorMsg('');

    const pkgName = selectedBaseline?.packageName || selectedAgent;
    createMutation.mutate({
      name: `missing-${pkgName}`,
      description: `Hosts missing ${selectedAgent} — created by SysCraft for bulk remediation`,
      organizationId: orgId,
      hostIds: missingHosts.map((h) => h.satelliteId),
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Create from Missing Agent</h2>
              <p className="text-xs text-slate-400">Auto-populate with hosts that need an agent installed</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {errorMsg && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{errorMsg}</div>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="input-field w-full appearance-none cursor-pointer"
            >
              <option value="">Select an agent...</option>
              {baselines.filter((b) => b.enabled).map((b) => (
                <option key={b.name} value={b.name}>{b.name} ({b.packageName})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Organization</label>
            <select value={orgId} onChange={(e) => setOrgId(parseInt(e.target.value, 10))} className="input-field w-full appearance-none cursor-pointer">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* Results */}
          {selectedAgent && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  Hosts missing {selectedBaseline?.packageName || selectedAgent}
                </label>
                {missingLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              </div>

              {!missingLoading && missingHosts.length === 0 ? (
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg text-center">
                  <p className="text-sm text-green-400">All Satellite hosts have this agent installed</p>
                </div>
              ) : !missingLoading && (
                <div className="border border-red-500/20 rounded-lg divide-y divide-slate-700/50 bg-red-500/5">
                  {missingHosts.map((h) => (
                    <div key={h.fqdn} className="flex items-center gap-3 px-3 py-2">
                      <Package className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-300 truncate">{h.fqdn}</p>
                        <p className="text-xs text-slate-500">{h.ip} {h.os && `— ${h.os}`}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {missingHosts.length > 0
              ? `Collection "missing-${selectedBaseline?.packageName || '...'}" with ${missingHosts.length} host${missingHosts.length !== 1 ? 's' : ''}`
              : 'Select an agent to see affected hosts'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || missingHosts.length === 0 || !selectedAgent}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
              ) : (
                <><FolderOpen className="w-4 h-4" />Create Collection</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Manage hosts ───────────────────────────────────────────── */

function ManageHostsModal({ collection, onClose }: { collection: HostCollection; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: hostsRes } = useQuery({ queryKey: ['satelliteHosts'], queryFn: getSatelliteHosts });
  const hosts = hostsRes?.data ?? [];
  const currentIds = new Set(collection.hostIds);

  const addMutation = useMutation({
    mutationFn: (hostIds: number[]) => addHostsToCollection(collection.id, hostIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostCollections'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (hostIds: number[]) => removeHostsFromCollection(collection.id, hostIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostCollections'] }),
  });

  const inCollection = hosts.filter((h) => currentIds.has(h.satelliteId));
  const available = hosts.filter((h) => !currentIds.has(h.satelliteId));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-semibold text-white">{collection.name}</h2>
            <p className="text-xs text-slate-400">{collection.totalHosts} host{collection.totalHosts !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">Current Members</p>
            {inCollection.length === 0 ? (
              <p className="text-sm text-slate-500 p-3 bg-slate-700/20 rounded-lg">No hosts in this collection</p>
            ) : (
              <div className="border border-slate-700 rounded-lg divide-y divide-slate-700/50">
                {inCollection.map((h) => (
                  <div key={h.satelliteId} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-slate-300 truncate">{h.fqdn}</span>
                    <button onClick={() => removeMutation.mutate([h.satelliteId])} disabled={removeMutation.isPending} className="p-1 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0" title="Remove from collection">
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
                  <div key={h.satelliteId} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-slate-400 truncate">{h.fqdn}</span>
                    <button onClick={() => addMutation.mutate([h.satelliteId])} disabled={addMutation.isPending} className="p-1 text-slate-500 hover:text-green-400 transition-colors flex-shrink-0" title="Add to collection">
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex items-center justify-between">
          <a href={`https://satellite.ailab.local/host_collections/${collection.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors">
            <ExternalLink className="w-3 h-3" />
            Open in Satellite to run actions
          </a>
          <button onClick={onClose} className="btn-ghost text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
