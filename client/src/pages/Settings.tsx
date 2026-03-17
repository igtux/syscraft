import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Globe,
  Monitor,
  RefreshCw,
  Clock,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  User,
  KeyRound,
  Wifi,
  Hash,
  Layers,
  ClipboardCheck,
  Activity,
  Database,
  Plug,
  Trash2,
  XCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  getSettings,
  updateSettings,
  getDataSources,
  testDataSource,
  updateDataSource,
  type SettingEntry,
  type DataSourceEntry,
} from '@/lib/api';

interface SettingsForm {
  satellite_url: string;
  satellite_user: string;
  satellite_password: string;
  checkmk_url: string;
  checkmk_user: string;
  checkmk_password: string;
  dns_enabled: string;
  dns_server: string;
  dns_port: string;
  dns_zone: string;
  dns_batch_size: string;
  dns_batch_delay_ms: string;
  sync_interval_minutes: string;
  stale_threshold_hours: string;
  cleanup_threshold_days: string;
  ping_enabled: string;
  ping_timeout_ms: string;
  ping_batch_size: string;
  [key: string]: string;
}

const DEFAULT_FORM: SettingsForm = {
  satellite_url: '',
  satellite_user: '',
  satellite_password: '',
  checkmk_url: '',
  checkmk_user: '',
  checkmk_password: '',
  dns_enabled: 'false',
  dns_server: '127.0.0.1',
  dns_port: '53',
  dns_zone: 'ailab.local',
  dns_batch_size: '20',
  dns_batch_delay_ms: '100',
  sync_interval_minutes: '15',
  stale_threshold_hours: '72',
  cleanup_threshold_days: '7',
  ping_enabled: 'true',
  ping_timeout_ms: '3000',
  ping_batch_size: '10',
};

function settingsArrayToForm(settings: SettingEntry[]): SettingsForm {
  const form: SettingsForm = { ...DEFAULT_FORM };
  for (const s of settings) {
    form[s.key] = s.value;
  }
  return form;
}

function PasswordField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative flex-1">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full pr-10"
        placeholder={placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function DataSourcesCard() {
  const queryClient = useQueryClient();
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; connected: boolean; error: string | null } | null>(null);

  const { data: sourcesResp } = useQuery({
    queryKey: ['dataSources'],
    queryFn: getDataSources,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateDataSource(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataSources'] }),
  });

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await testDataSource(id);
      setTestResult({ id, connected: result.connected, error: result.error });
    } catch {
      setTestResult({ id, connected: false, error: 'Test failed' });
    }
    setTestingId(null);
  };

  const sources = sourcesResp?.data ?? [];

  return (
    <Card title="Data Sources" subtitle="Connected infrastructure systems">
      <div className="space-y-3">
        {sources.map((src) => (
          <div key={src.id} className={cn(
            'flex items-center justify-between p-4 rounded-lg border transition-colors',
            src.enabled ? 'bg-slate-700/20 border-slate-700/50' : 'bg-slate-800/50 border-slate-700/30 opacity-60'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', src.enabled ? 'bg-blue-500/20' : 'bg-slate-700')}>
                <Database className={cn('w-5 h-5', src.enabled ? 'text-blue-400' : 'text-slate-500')} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{src.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded font-mono">{src.adapter}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  <span>{src.hostCount} hosts</span>
                  <span>{src.lastSyncStatus === 'never' ? 'Never synced' : `Last: ${src.lastSyncStatus}`}</span>
                  {src.capabilities.length > 0 && (
                    <span>{src.capabilities.join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {testResult?.id === src.id && (
                <span className={cn('text-xs', testResult.connected ? 'text-green-400' : 'text-red-400')}>
                  {testResult.connected ? 'Connected' : testResult.error || 'Failed'}
                </span>
              )}
              <button
                onClick={() => handleTest(src.id)}
                disabled={testingId === src.id}
                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                title="Test connection"
              >
                {testingId === src.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              </button>
              <button
                onClick={() => toggleMut.mutate({ id: src.id, enabled: !src.enabled })}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  src.enabled ? 'bg-blue-600' : 'bg-slate-600'
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                  src.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          </div>
        ))}
        {sources.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">No data sources configured.</p>
        )}
      </div>
    </Card>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: settingsResponse, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const [formData, setFormData] = useState<SettingsForm>({ ...DEFAULT_FORM });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (settingsResponse?.data) {
      setFormData(settingsArrayToForm(settingsResponse.data));
    }
  }, [settingsResponse]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string | number>) => updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      satellite_url: formData.satellite_url,
      satellite_user: formData.satellite_user,
      satellite_password: formData.satellite_password,
      checkmk_url: formData.checkmk_url,
      checkmk_user: formData.checkmk_user,
      checkmk_password: formData.checkmk_password,
      dns_enabled: formData.dns_enabled,
      dns_server: formData.dns_server,
      dns_port: formData.dns_port,
      dns_zone: formData.dns_zone,
      dns_batch_size: formData.dns_batch_size,
      dns_batch_delay_ms: formData.dns_batch_delay_ms,
      sync_interval_minutes: formData.sync_interval_minutes,
      stale_threshold_hours: formData.stale_threshold_hours,
      cleanup_threshold_days: formData.cleanup_threshold_days,
      ping_enabled: formData.ping_enabled,
      ping_timeout_ms: formData.ping_timeout_ms,
      ping_batch_size: formData.ping_batch_size,
    });
  };

  if (isLoading) {
    return (
      <div>
        <Header title="Settings" subtitle="System configuration" />
        <div className="p-6 flex items-center justify-center min-h-96">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Settings" subtitle="System configuration" />
        <div className="p-6">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Failed to load settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Settings" subtitle="System configuration" />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Data Sources */}
        <DataSourcesCard />

        {/* Satellite Connection */}
        <Card title="Red Hat Satellite" subtitle="Satellite API connection and credentials">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-red-400" />
                <label className="text-sm font-medium text-slate-300">API URL</label>
              </div>
              <input
                type="text"
                value={formData.satellite_url}
                onChange={(e) => setFormData((f) => ({ ...f, satellite_url: e.target.value }))}
                className="input-field w-full"
                placeholder="https://satellite.example.com"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-red-400" />
                  <label className="text-sm font-medium text-slate-300">Username</label>
                </div>
                <input
                  type="text"
                  value={formData.satellite_user}
                  onChange={(e) => setFormData((f) => ({ ...f, satellite_user: e.target.value }))}
                  className="input-field w-full"
                  placeholder="admin"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-red-400" />
                  <label className="text-sm font-medium text-slate-300">Password</label>
                </div>
                <PasswordField
                  value={formData.satellite_password}
                  onChange={(v) => setFormData((f) => ({ ...f, satellite_password: v }))}
                  placeholder="Satellite password"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Checkmk Connection */}
        <Card title="Checkmk Monitoring" subtitle="Checkmk REST API connection and credentials">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-green-400" />
                <label className="text-sm font-medium text-slate-300">API URL</label>
              </div>
              <input
                type="text"
                value={formData.checkmk_url}
                onChange={(e) => setFormData((f) => ({ ...f, checkmk_url: e.target.value }))}
                className="input-field w-full"
                placeholder="http://checkmk.example.com/site/check_mk/api/1.0"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-green-400" />
                  <label className="text-sm font-medium text-slate-300">Automation User</label>
                </div>
                <input
                  type="text"
                  value={formData.checkmk_user}
                  onChange={(e) => setFormData((f) => ({ ...f, checkmk_user: e.target.value }))}
                  className="input-field w-full"
                  placeholder="automation"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-green-400" />
                  <label className="text-sm font-medium text-slate-300">Automation Secret</label>
                </div>
                <PasswordField
                  value={formData.checkmk_password}
                  onChange={(v) => setFormData((f) => ({ ...f, checkmk_password: v }))}
                  placeholder="Automation secret"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* DNS Server */}
        <Card title="DNS Server" subtitle="DNS record validation for forward and reverse lookups">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-purple-400" />
                <label className="text-sm font-medium text-slate-300">Enable DNS Checking</label>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormData((f) => ({
                    ...f,
                    dns_enabled: f.dns_enabled === 'true' ? 'false' : 'true',
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.dns_enabled === 'true' ? 'bg-purple-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.dns_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <label className="text-sm font-medium text-slate-300">Server IP</label>
                </div>
                <input
                  type="text"
                  value={formData.dns_server}
                  onChange={(e) => setFormData((f) => ({ ...f, dns_server: e.target.value }))}
                  className="input-field w-full"
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-purple-400" />
                  <label className="text-sm font-medium text-slate-300">Port</label>
                </div>
                <input
                  type="number"
                  value={formData.dns_port}
                  onChange={(e) => setFormData((f) => ({ ...f, dns_port: e.target.value }))}
                  className="input-field w-full"
                  placeholder="53"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <label className="text-sm font-medium text-slate-300">Zone</label>
                </div>
                <input
                  type="text"
                  value={formData.dns_zone}
                  onChange={(e) => setFormData((f) => ({ ...f, dns_zone: e.target.value }))}
                  className="input-field w-full"
                  placeholder="ailab.local"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Batch Size</label>
                <input
                  type="number"
                  value={formData.dns_batch_size}
                  onChange={(e) => setFormData((f) => ({ ...f, dns_batch_size: e.target.value }))}
                  className="input-field w-full"
                  placeholder="20"
                />
                <p className="text-xs text-slate-500">Concurrent DNS queries per batch.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Batch Delay (ms)</label>
                <input
                  type="number"
                  value={formData.dns_batch_delay_ms}
                  onChange={(e) => setFormData((f) => ({ ...f, dns_batch_delay_ms: e.target.value }))}
                  className="input-field w-full"
                  placeholder="100"
                />
                <p className="text-xs text-slate-500">Milliseconds between query batches.</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Sync Configuration */}
        <Card title="Sync Configuration" subtitle="Control how often data is synchronized">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-400" />
                <label className="text-sm font-medium text-slate-300">Sync Interval</label>
              </div>
              <select
                value={formData.sync_interval_minutes}
                onChange={(e) => setFormData((f) => ({ ...f, sync_interval_minutes: e.target.value }))}
                className="input-field appearance-none cursor-pointer"
              >
                <option value="5">Every 5 minutes</option>
                <option value="10">Every 10 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 1 hour</option>
                <option value="120">Every 2 hours</option>
                <option value="360">Every 6 hours</option>
                <option value="720">Every 12 hours</option>
                <option value="1440">Every 24 hours</option>
              </select>
              <p className="text-xs text-slate-500">
                How often SysCraft pulls data from all configured sources.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <label className="text-sm font-medium text-slate-300">Stale Threshold</label>
              </div>
              <select
                value={formData.stale_threshold_hours}
                onChange={(e) => setFormData((f) => ({ ...f, stale_threshold_hours: e.target.value }))}
                className="input-field appearance-none cursor-pointer"
              >
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">72 hours</option>
                <option value="168">7 days</option>
              </select>
              <p className="text-xs text-slate-500">
                Hosts not seen within this window will be flagged as stale.
              </p>
            </div>
          </div>
        </Card>

        {/* Recommendations */}
        <Card title="Recommendations" subtitle="Liveness detection and cleanup thresholds">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <label className="text-sm font-medium text-slate-300">Enable ICMP Ping</label>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormData((f) => ({
                    ...f,
                    ping_enabled: f.ping_enabled === 'true' ? 'false' : 'true',
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.ping_enabled === 'true' ? 'bg-cyan-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.ping_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-cyan-400" />
                  <label className="text-sm font-medium text-slate-300">Cleanup Threshold</label>
                </div>
                <select
                  value={formData.cleanup_threshold_days}
                  onChange={(e) => setFormData((f) => ({ ...f, cleanup_threshold_days: e.target.value }))}
                  className="input-field appearance-none cursor-pointer"
                >
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
                <p className="text-xs text-slate-500">Days unreachable before recommending cleanup.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Ping Timeout (ms)</label>
                <input
                  type="number"
                  value={formData.ping_timeout_ms}
                  onChange={(e) => setFormData((f) => ({ ...f, ping_timeout_ms: e.target.value }))}
                  className="input-field w-full"
                  placeholder="3000"
                />
                <p className="text-xs text-slate-500">Milliseconds to wait per ping.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Ping Batch Size</label>
                <input
                  type="number"
                  value={formData.ping_batch_size}
                  onChange={(e) => setFormData((f) => ({ ...f, ping_batch_size: e.target.value }))}
                  className="input-field w-full"
                  placeholder="10"
                />
                <p className="text-xs text-slate-500">Concurrent pings per batch.</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveMutation.isError && (
            <p className="text-sm text-red-400">Failed to save settings. Please try again.</p>
          )}
          {saveSuccess && (
            <div className="flex items-center gap-2 text-green-400 text-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              Settings saved — services reconfigured
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
