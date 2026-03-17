import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Users,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn, scoreColor } from '@/lib/utils';
import {
  getCompliance,
  getBaselines,
  createBaseline,
  updateBaseline,
  deleteBaseline,
  type ComplianceResponse,
  type ComplianceEntry,
  type Baseline,
} from '@/lib/api';

type Tab = 'matrix' | 'baselines';

export default function Compliance() {
  const [activeTab, setActiveTab] = useState<Tab>('matrix');
  const [showNonCompliantOnly, setShowNonCompliantOnly] = useState(false);

  const { data: compliance, isLoading: compLoading } = useQuery({
    queryKey: ['compliance'],
    queryFn: getCompliance,
  });

  const { data: baselinesResponse, isLoading: baseLoading } = useQuery({
    queryKey: ['baselines'],
    queryFn: getBaselines,
  });

  const baselines = baselinesResponse?.data ?? [];
  const isLoading = compLoading || baseLoading;

  return (
    <div>
      <Header title="Agent Compliance" subtitle="Monitor required agent deployment across hosts" />

      <div className="p-6 space-y-6">
        {/* Summary Bar */}
        {compliance && <ComplianceSummary data={compliance} />}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('matrix')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
              activeTab === 'matrix'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            )}
          >
            Compliance Matrix
          </button>
          <button
            onClick={() => setActiveTab('baselines')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
              activeTab === 'baselines'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            )}
          >
            Baseline Configuration
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : activeTab === 'matrix' ? (
          <ComplianceMatrix
            data={compliance!}
            showNonCompliantOnly={showNonCompliantOnly}
            onToggleFilter={setShowNonCompliantOnly}
          />
        ) : (
          <BaselineConfig baselines={baselines} />
        )}
      </div>
    </div>
  );
}

function ComplianceSummary({ data }: { data: ComplianceResponse }) {
  const hosts = data.data;
  const totalHosts = data.total;
  const fullyCompliant = hosts.filter((h) => h.complianceScore === 100).length;
  const needsAttention = hosts.filter((h) => h.complianceScore < 100).length;
  const overallScore = totalHosts > 0
    ? Math.round(hosts.reduce((sum, h) => sum + h.complianceScore, 0) / totalHosts)
    : 0;
  const sc = scoreColor(overallScore);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 flex items-center gap-4">
        <div className={cn('w-14 h-14 rounded-full flex items-center justify-center ring-4', sc.ring, 'bg-slate-700/50')}>
          <span className={cn('text-xl font-bold', sc.text)}>{overallScore}%</span>
        </div>
        <div>
          <p className="text-sm text-slate-400">Overall Compliance</p>
          <p className="text-xl font-bold text-white">{totalHosts} hosts</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-green-500/20 rounded-lg p-5 flex items-center gap-4">
        <div className="p-3 bg-green-500/10 rounded-lg">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Fully Compliant</p>
          <p className="text-xl font-bold text-green-400">{fullyCompliant} hosts</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-amber-500/20 rounded-lg p-5 flex items-center gap-4">
        <div className="p-3 bg-amber-500/10 rounded-lg">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Needs Attention</p>
          <p className="text-xl font-bold text-amber-400">{needsAttention} hosts</p>
        </div>
      </div>
    </div>
  );
}

function ComplianceMatrix({
  data,
  showNonCompliantOnly,
  onToggleFilter,
}: {
  data: ComplianceResponse;
  showNonCompliantOnly: boolean;
  onToggleFilter: (value: boolean) => void;
}) {
  const hosts = showNonCompliantOnly
    ? data.data.filter((h) => h.complianceScore < 100)
    : data.data;

  const agentNames = data.data.length > 0 ? data.data[0].agents.map((a) => a.name) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-slate-400">Installed & Running</span>
          </div>
          <div className="flex items-center gap-2">
            <MinusCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Installed, Not Running</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-slate-400">Not Installed</span>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showNonCompliantOnly}
            onChange={(e) => onToggleFilter(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/30"
          />
          <span className="text-sm text-slate-400">Show non-compliant only</span>
        </label>
      </div>

      {hosts.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
            <p className="text-slate-400">All hosts are fully compliant</p>
          </div>
        </Card>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-800 z-10">
                    Host
                  </th>
                  {agentNames.map((name) => (
                    <th
                      key={name}
                      className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((host, i) => {
                  const sc = scoreColor(host.complianceScore);
                  return (
                    <tr
                      key={host.fqdn}
                      className={cn(
                        'border-b border-slate-700/50',
                        i % 2 === 1 && 'bg-slate-700/20'
                      )}
                    >
                      <td className="px-4 py-3 sticky left-0 bg-slate-800 z-10">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <span className="text-sm text-white font-medium truncate max-w-48">
                            {host.fqdn}
                          </span>
                        </div>
                      </td>
                      {host.agents.map((agent) => (
                        <td key={agent.name} className="px-4 py-3 text-center">
                          {agent.installed && agent.running ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                          ) : agent.installed ? (
                            <MinusCircle className="w-5 h-5 text-amber-400 mx-auto" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400 mx-auto" />
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span className={cn('text-sm font-bold', sc.text)}>
                          {host.complianceScore}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface BaselineFormData {
  name: string;
  packageName: string;
  enabled: boolean;
  description: string;
  requiredForGroups: string[];
}

function BaselineConfig({ baselines }: { baselines: Baseline[] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<BaselineFormData>({
    name: '',
    packageName: '',
    enabled: true,
    description: '',
    requiredForGroups: [],
  });

  const createMutation = useMutation({
    mutationFn: createBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      setShowCreateForm(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Baseline> }) => updateBaseline(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      setEditingId(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBaseline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
    },
  });

  function resetForm() {
    setFormData({ name: '', packageName: '', enabled: true, description: '', requiredForGroups: [] });
  }

  function startEdit(baseline: Baseline) {
    setEditingId(baseline.id);
    setFormData({
      name: baseline.name,
      packageName: baseline.packageName,
      enabled: baseline.enabled,
      description: baseline.description,
      requiredForGroups: baseline.requiredForGroups ?? [],
    });
    setShowCreateForm(false);
  }

  function handleSave() {
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData as Omit<Baseline, 'id' | 'createdAt' | 'updatedAt'>);
    }
  }

  const isFormValid = formData.name.trim() && formData.packageName.trim();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Define which agents are required on your hosts
        </p>
        {!showCreateForm && editingId === null && (
          <button
            onClick={() => { setShowCreateForm(true); resetForm(); }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Baseline
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingId !== null) && (
        <div className="bg-slate-800 rounded-lg border border-blue-500/30 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              {editingId !== null ? 'Edit Baseline' : 'New Baseline'}
            </h3>
            <button
              onClick={() => { setShowCreateForm(false); setEditingId(null); resetForm(); }}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                className="input-field"
                placeholder="e.g., Checkmk Agent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Package Name</label>
              <input
                type="text"
                value={formData.packageName}
                onChange={(e) => setFormData((f) => ({ ...f, packageName: e.target.value }))}
                className="input-field"
                placeholder="e.g., check-mk-agent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                className="input-field"
                placeholder="Brief description of this baseline requirement"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData((f) => ({ ...f, enabled: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/30"
              />
              <label htmlFor="enabled" className="text-sm text-slate-300 cursor-pointer">
                Enabled
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-700/50">
            <button
              onClick={() => { setShowCreateForm(false); setEditingId(null); resetForm(); }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isFormValid || isSaving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Baseline List */}
      {baselines.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No baselines configured</p>
            <p className="text-sm text-slate-500 mt-1">Add a baseline to define required agents.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {baselines.map((baseline) => (
            <div
              key={baseline.id}
              className="bg-slate-800 rounded-lg border border-slate-700 p-4 flex items-center justify-between hover:border-slate-600 transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  'p-2 rounded-lg',
                  baseline.enabled ? 'bg-blue-500/10' : 'bg-slate-700/50'
                )}>
                  <Shield className={cn(
                    'w-5 h-5',
                    baseline.enabled ? 'text-blue-400' : 'text-slate-400'
                  )} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">{baseline.name}</h4>
                    {baseline.enabled && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">
                        ENABLED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Package: <span className="font-mono text-slate-300">{baseline.packageName}</span>
                    {baseline.description && ` — ${baseline.description}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(baseline)}
                  className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 rounded-lg transition-all"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete baseline "${baseline.name}"?`)) {
                      deleteMutation.mutate(baseline.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
