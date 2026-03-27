import { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  ChevronRight,
  Bell,
  Plus,
  Send,
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
  testSettingsConnection,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  type SettingEntry,
  type DataSourceEntry,
  type WebhookEntry,
} from '@/lib/api';

interface SettingsForm {
  satellite_url: string;
  satellite_user: string;
  satellite_password: string;
  satellite_activation_key: string;
  satellite_organization: string;
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
  rec_register_satellite: string;
  rec_add_checkmk: string;
  rec_cleanup_dead: string;
  rec_install_agent: string;
  rec_classify_os: string;
  rec_add_dns: string;
  rec_fix_dns_reverse: string;
  rec_fix_dns_mismatch: string;
  rec_ip_reuse: string;
  rec_vm_powered_off: string;
  vm_powered_off_threshold_days: string;
  [key: string]: string;
}

const DEFAULT_FORM: SettingsForm = {
  satellite_url: '',
  satellite_user: '',
  satellite_password: '',
  satellite_activation_key: 'ailab-rhel9',
  satellite_organization: 'ailab',
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
  rec_register_satellite: 'true',
  rec_add_checkmk: 'true',
  rec_cleanup_dead: 'true',
  rec_install_agent: 'true',
  rec_classify_os: 'true',
  rec_add_dns: 'true',
  rec_fix_dns_reverse: 'true',
  rec_fix_dns_mismatch: 'true',
  rec_ip_reuse: 'true',
  rec_vm_powered_off: 'true',
  vm_powered_off_threshold_days: '14',
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

/* ---------- Toggle Switch (small) ---------- */
function ToggleSwitch({
  enabled,
  onToggle,
  color = 'cyan',
}: {
  enabled: boolean;
  onToggle: () => void;
  color?: string;
}) {
  const bgOn =
    color === 'cyan'
      ? 'bg-cyan-600'
      : color === 'purple'
        ? 'bg-purple-600'
        : color === 'blue'
          ? 'bg-blue-600'
          : 'bg-cyan-600';

  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0',
        enabled ? bgOn : 'bg-slate-600',
      )}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(4px)' }}
      />
    </button>
  );
}

/* ---------- Collapsible Card ---------- */
function CollapsibleCard({
  title,
  icon: Icon,
  iconColor,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [open, children]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('p-2 rounded-lg bg-opacity-20', `bg-${iconColor.replace('text-', '')}/20`)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-xs text-slate-400 truncate">{summary}</p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 transition-transform" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 transition-transform" />
        )}
      </button>

      {/* Animated body */}
      <div
        style={{ maxHeight: open ? (height ?? 2000) : 0 }}
        className="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      >
        <div ref={contentRef} className="px-6 pb-6 pt-2">
          {children}
        </div>
      </div>
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
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: src.enabled ? 'translateX(18px)' : 'translateX(3px)' }}
                />
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

/* ---------- Webhooks Card ---------- */

const WEBHOOK_EVENTS = [
  'recommendation_critical',
  'recommendation_high',
  'source_down',
  'host_stale',
  'host_discovered',
  'liveness_changed',
  'sync_completed',
  'daily_summary',
] as const;

function WebhooksCard() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; error?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    url: '',
    secret: '',
    method: 'POST',
    events: [] as string[],
    retryCount: 3,
  });

  const { data: webhooksResp } = useQuery({
    queryKey: ['webhooks'],
    queryFn: getWebhooks,
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<WebhookEntry>) => createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setShowForm(false);
      setForm({ name: '', url: '', secret: '', method: 'POST', events: [], retryCount: 3 });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateWebhook(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setDeletingId(null);
    },
  });

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await testWebhook(id);
      setTestResult({ id, success: result.success, error: result.success ? undefined : result.response });
    } catch {
      setTestResult({ id, success: false, error: 'Test request failed' });
    }
    setTestingId(null);
  };

  const handleAdd = () => {
    if (!form.name || !form.url) return;
    createMut.mutate({
      name: form.name,
      url: form.url,
      secret: form.secret,
      method: form.method,
      events: form.events,
      retryCount: form.retryCount,
      enabled: true,
    });
  };

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  };

  const webhooks = webhooksResp?.data ?? [];

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const truncateUrl = (url: string, max = 40) => (url.length > max ? url.slice(0, max) + '...' : url);

  return (
    <div className="space-y-3">
      {/* Webhook list */}
      {webhooks.map((wh) => (
        <div
          key={wh.id}
          className={cn(
            'flex items-center justify-between p-4 rounded-lg border transition-colors',
            wh.enabled ? 'bg-slate-700/20 border-slate-700/50' : 'bg-slate-800/50 border-slate-700/30 opacity-60',
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('p-2 rounded-lg', wh.enabled ? 'bg-amber-500/20' : 'bg-slate-700')}>
              <Bell className={cn('w-4 h-4', wh.enabled ? 'text-amber-400' : 'text-slate-500')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{wh.name}</p>
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded font-mono">{wh.method}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                <span className="truncate" title={wh.url}>{truncateUrl(wh.url)}</span>
                <span>{wh.events.length} events</span>
                <span>Fired: {formatTime(wh.lastFiredAt)}</span>
                {wh.lastStatus !== null && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                    wh.lastStatus >= 200 && wh.lastStatus < 300
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400',
                  )}>
                    {wh.lastStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {testResult?.id === wh.id && (
              <span className={cn('text-xs', testResult.success ? 'text-green-400' : 'text-red-400')}>
                {testResult.success ? 'OK' : testResult.error || 'Failed'}
              </span>
            )}
            <button
              onClick={() => handleTest(wh.id)}
              disabled={testingId === wh.id}
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
              title="Test webhook"
            >
              {testingId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            {deletingId === wh.id ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => deleteMut.mutate(wh.id)}
                  className="text-[10px] px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="text-[10px] px-2 py-1 bg-slate-700 text-slate-400 rounded hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeletingId(wh.id)}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Delete webhook"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <ToggleSwitch
              enabled={wh.enabled}
              onToggle={() => toggleMut.mutate({ id: wh.id, enabled: !wh.enabled })}
              color="cyan"
            />
          </div>
        </div>
      ))}

      {webhooks.length === 0 && !showForm && (
        <p className="text-sm text-slate-500 text-center py-4">No webhooks configured.</p>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-field w-full"
                placeholder="My Webhook"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">URL</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="input-field w-full"
                placeholder="https://example.com/hook"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Secret</label>
              <PasswordField
                value={form.secret}
                onChange={(v) => setForm((f) => ({ ...f, secret: v }))}
                placeholder="HMAC secret (optional)"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Method</label>
              <select
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                className="input-field w-full appearance-none cursor-pointer"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Retry Count</label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.retryCount}
                onChange={(e) => setForm((f) => ({ ...f, retryCount: parseInt(e.target.value, 10) || 0 }))}
                className="input-field w-full"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Events</label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500/30 h-3.5 w-3.5"
                  />
                  {ev.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={createMut.isPending || !form.name || !form.url}
              className="btn-primary text-sm flex items-center gap-1.5 px-3 py-1.5"
            >
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
          {createMut.isError && (
            <p className="text-xs text-red-400">Failed to create webhook.</p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-700/50 text-sm text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      )}
    </div>
  );
}

/* ---------- Recommendation toggle row ---------- */
function RecToggle({
  label,
  enabled,
  onToggle,
  extra,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-slate-300">{label}</span>
        {extra}
      </div>
      <ToggleSwitch enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

/* ---------- Interval label helper ---------- */
function intervalLabel(minutes: string): string {
  const m = parseInt(minutes, 10);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${m / 60}h`;
  return `${m / 1440}d`;
}

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: settingsResponse, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const { data: webhooksResp } = useQuery({
    queryKey: ['webhooks'],
    queryFn: getWebhooks,
  });

  const [formData, setFormData] = useState<SettingsForm>({ ...DEFAULT_FORM });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingAdapter, setTestingAdapter] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { connected: boolean; error: string | null }>>({});

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
      satellite_activation_key: formData.satellite_activation_key,
      satellite_organization: formData.satellite_organization,
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
      rec_register_satellite: formData.rec_register_satellite,
      rec_add_checkmk: formData.rec_add_checkmk,
      rec_cleanup_dead: formData.rec_cleanup_dead,
      rec_install_agent: formData.rec_install_agent,
      rec_classify_os: formData.rec_classify_os,
      rec_add_dns: formData.rec_add_dns,
      rec_fix_dns_reverse: formData.rec_fix_dns_reverse,
      rec_fix_dns_mismatch: formData.rec_fix_dns_mismatch,
      rec_ip_reuse: formData.rec_ip_reuse,
      rec_vm_powered_off: formData.rec_vm_powered_off,
      vm_powered_off_threshold_days: formData.vm_powered_off_threshold_days,
    });
  };

  const handleTestConnection = async (adapter: string) => {
    setTestingAdapter(adapter);
    setTestResults((prev) => { const next = { ...prev }; delete next[adapter]; return next; });
    try {
      let config: Record<string, any>;
      switch (adapter) {
        case 'satellite':
          config = { url: formData.satellite_url, user: formData.satellite_user, password: formData.satellite_password };
          break;
        case 'checkmk':
          config = { url: formData.checkmk_url, user: formData.checkmk_user, password: formData.checkmk_password };
          break;
        case 'dns':
          config = { server: formData.dns_server, port: formData.dns_port, zone: formData.dns_zone };
          break;
        default:
          return;
      }
      const result = await testSettingsConnection(adapter, config);
      setTestResults((prev) => ({ ...prev, [adapter]: { connected: result.connected, error: result.error } }));
    } catch {
      setTestResults((prev) => ({ ...prev, [adapter]: { connected: false, error: 'Test request failed' } }));
    }
    setTestingAdapter(null);
  };

  const toggle = (key: keyof SettingsForm) =>
    setFormData((f) => ({ ...f, [key]: f[key] === 'true' ? 'false' : 'true' }));

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
        {/* Data Sources — always visible */}
        <DataSourcesCard />

        {/* Webhooks — collapsible */}
        <CollapsibleCard
          title="Webhooks"
          icon={Bell}
          iconColor="text-amber-400"
          summary={`${(webhooksResp?.data ?? []).filter((w) => w.enabled).length} enabled`}
        >
          <WebhooksCard />
        </CollapsibleCard>

        {/* Red Hat Satellite — collapsible */}
        <CollapsibleCard
          title="Red Hat Satellite"
          icon={Globe}
          iconColor="text-red-400"
          summary={formData.satellite_url || 'Not configured'}
        >
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Organization</label>
                <input
                  type="text"
                  value={formData.satellite_organization}
                  onChange={(e) => setFormData((f) => ({ ...f, satellite_organization: e.target.value }))}
                  className="input-field w-full"
                  placeholder="ailab"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500">Satellite organization for host registration.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Activation Key</label>
                <input
                  type="text"
                  value={formData.satellite_activation_key}
                  onChange={(e) => setFormData((f) => ({ ...f, satellite_activation_key: e.target.value }))}
                  className="input-field w-full"
                  placeholder="ailab-rhel9"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500">Activation key used in registration commands.</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-700/50">
              {testResults.satellite ? (
                <span className={cn('text-xs flex items-center gap-1.5', testResults.satellite.connected ? 'text-green-400' : 'text-red-400')}>
                  {testResults.satellite.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResults.satellite.connected ? 'Connection successful' : (testResults.satellite.error || 'Connection failed')}
                </span>
              ) : <span />}
              <button
                type="button"
                onClick={() => handleTestConnection('satellite')}
                disabled={testingAdapter === 'satellite'}
                className="text-sm text-slate-400 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
              >
                {testingAdapter === 'satellite' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          </div>
        </CollapsibleCard>

        {/* Checkmk Monitoring — collapsible */}
        <CollapsibleCard
          title="Checkmk Monitoring"
          icon={Monitor}
          iconColor="text-green-400"
          summary={formData.checkmk_url || 'Not configured'}
        >
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
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-700/50">
              {testResults.checkmk ? (
                <span className={cn('text-xs flex items-center gap-1.5', testResults.checkmk.connected ? 'text-green-400' : 'text-red-400')}>
                  {testResults.checkmk.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResults.checkmk.connected ? 'Connection successful' : (testResults.checkmk.error || 'Connection failed')}
                </span>
              ) : <span />}
              <button
                type="button"
                onClick={() => handleTestConnection('checkmk')}
                disabled={testingAdapter === 'checkmk'}
                className="text-sm text-slate-400 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
              >
                {testingAdapter === 'checkmk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          </div>
        </CollapsibleCard>

        {/* DNS Server — collapsible */}
        <CollapsibleCard
          title="DNS Server"
          icon={Wifi}
          iconColor="text-purple-400"
          summary={
            formData.dns_enabled === 'true'
              ? `Enabled \u00b7 ${formData.dns_server}`
              : `Disabled \u00b7 ${formData.dns_server}`
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-purple-400" />
                <label className="text-sm font-medium text-slate-300">Enable DNS Checking</label>
              </div>
              <button
                type="button"
                onClick={() => toggle('dns_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.dns_enabled === 'true' ? 'bg-purple-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: formData.dns_enabled === 'true' ? 'translateX(22px)' : 'translateX(4px)' }}
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
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-700/50">
              {testResults.dns ? (
                <span className={cn('text-xs flex items-center gap-1.5', testResults.dns.connected ? 'text-green-400' : 'text-red-400')}>
                  {testResults.dns.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResults.dns.connected ? 'Connection successful' : (testResults.dns.error || 'Connection failed')}
                </span>
              ) : <span />}
              <button
                type="button"
                onClick={() => handleTestConnection('dns')}
                disabled={testingAdapter === 'dns'}
                className="text-sm text-slate-400 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
              >
                {testingAdapter === 'dns' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          </div>
        </CollapsibleCard>

        {/* Sync Configuration — collapsible */}
        <CollapsibleCard
          title="Sync Configuration"
          icon={RefreshCw}
          iconColor="text-blue-400"
          summary={`Every ${intervalLabel(formData.sync_interval_minutes)} \u00b7 stale after ${formData.stale_threshold_hours}h`}
        >
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
        </CollapsibleCard>

        {/* Recommendations — collapsible */}
        <CollapsibleCard
          title="Recommendations"
          icon={Activity}
          iconColor="text-cyan-400"
          summary={`Ping ${formData.ping_enabled === 'true' ? 'enabled' : 'disabled'} \u00b7 cleanup after ${formData.cleanup_threshold_days}d`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <label className="text-sm font-medium text-slate-300">Enable ICMP Ping</label>
              </div>
              <button
                type="button"
                onClick={() => toggle('ping_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.ping_enabled === 'true' ? 'bg-cyan-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: formData.ping_enabled === 'true' ? 'translateX(22px)' : 'translateX(4px)' }}
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

            {/* Recommendation Rules */}
            <div className="border-t border-slate-700/50 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-white mb-3">Recommendation Rules</h4>

              {/* Registration & Monitoring */}
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Registration &amp; Monitoring</p>
                <div className="space-y-1 pl-1">
                  <RecToggle
                    label="Register missing hosts in Satellite"
                    enabled={formData.rec_register_satellite === 'true'}
                    onToggle={() => toggle('rec_register_satellite')}
                  />
                  <RecToggle
                    label="Add missing hosts to Checkmk"
                    enabled={formData.rec_add_checkmk === 'true'}
                    onToggle={() => toggle('rec_add_checkmk')}
                  />
                  <RecToggle
                    label="Install missing agents"
                    enabled={formData.rec_install_agent === 'true'}
                    onToggle={() => toggle('rec_install_agent')}
                  />
                </div>
              </div>

              {/* DNS */}
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">DNS</p>
                <div className="space-y-1 pl-1">
                  <RecToggle
                    label="Create missing DNS records"
                    enabled={formData.rec_add_dns === 'true'}
                    onToggle={() => toggle('rec_add_dns')}
                  />
                  <RecToggle
                    label="Fix missing reverse PTR"
                    enabled={formData.rec_fix_dns_reverse === 'true'}
                    onToggle={() => toggle('rec_fix_dns_reverse')}
                  />
                  <RecToggle
                    label="Fix DNS mismatches"
                    enabled={formData.rec_fix_dns_mismatch === 'true'}
                    onToggle={() => toggle('rec_fix_dns_mismatch')}
                  />
                </div>
              </div>

              {/* Cleanup & Detection */}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Cleanup &amp; Detection</p>
                <div className="space-y-1 pl-1">
                  <RecToggle
                    label="Recommend cleanup for dead hosts"
                    enabled={formData.rec_cleanup_dead === 'true'}
                    onToggle={() => toggle('rec_cleanup_dead')}
                  />
                  <RecToggle
                    label="Detect IP reuse / MAC conflicts"
                    enabled={formData.rec_ip_reuse === 'true'}
                    onToggle={() => toggle('rec_ip_reuse')}
                  />
                  <RecToggle
                    label="Prompt to classify unknown OS"
                    enabled={formData.rec_classify_os === 'true'}
                    onToggle={() => toggle('rec_classify_os')}
                  />
                  <div className="flex items-center justify-between gap-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-slate-300">Flag powered-off VMs</span>
                      {formData.rec_vm_powered_off === 'true' && (
                        <select
                          value={formData.vm_powered_off_threshold_days}
                          onChange={(e) =>
                            setFormData((f) => ({ ...f, vm_powered_off_threshold_days: e.target.value }))
                          }
                          className="input-field text-xs py-0.5 px-2 w-auto appearance-none cursor-pointer"
                        >
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                          <option value="60">60 days</option>
                        </select>
                      )}
                    </div>
                    <ToggleSwitch
                      enabled={formData.rec_vm_powered_off === 'true'}
                      onToggle={() => toggle('rec_vm_powered_off')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Save Button — always visible */}
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
