import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('syscraft_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('syscraft_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- Types ---

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SystemStatus {
  name: string;
  type: string;
  connected: boolean;
  lastSync: string | null;
  hostCount: number;
  error: string | null;
}

export interface AuditEvent {
  id: number;
  action: string;
  target: string;
  details: Record<string, unknown>;
  createdAt: string;
  username: string | null;
}

export type OsCategory = 'linux' | 'windows' | 'appliance' | 'unknown';

export interface RecommendationSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface DashboardData {
  totalHosts: number;
  activeHosts: number;
  partialHosts: number;
  staleHosts: number;
  newHosts: number;
  complianceAverage: number;
  systemStatuses: SystemStatus[];
  recentEvents: AuditEvent[];
  discrepancyCount: number;
  recommendationSummary: RecommendationSummary;
  hostsByOsCategory: {
    linux: number;
    windows: number;
    appliance: number;
    unknown: number;
  };
  hostCompliance: {
    bothSystems: number;
    onlyOne: number;
    none: number;
    percent: number;
  };
  agentCompliance: {
    installed: number;
    absent: number;
    percent: number;
  };
}

export interface HostSummary {
  fqdn: string;
  ip: string;
  os: string;
  osCategory: OsCategory;
  status: 'active' | 'partial' | 'stale' | 'new' | 'decommissioning';
  satelliteRegistered: boolean;
  checkmkMonitored: boolean;
  dnsPresent: boolean;
  complianceScore: number;
  lastPingSuccess: boolean;
  lastSeen: string;
  sources: string[];
}

export interface SatelliteData {
  hostId: number;
  hostGroup: string;
  organization: string;
  location: string;
  lifecycleEnv: string;
  contentView: string;
  subscriptionStatus: string;
  cpuCount: number;
  ramMb: number;
  kernel: string;
  arch: string;
  errata: {
    security: number;
    bugfix: number;
    enhancement: number;
  };
  installedPackages: number;
  lastCheckin: string;
  createdAt: string;
}

export interface CheckmkData {
  hostname: string;
  folder: string;
  status: 'UP' | 'DOWN' | 'UNREACHABLE' | 'PENDING';
  agentType: string;
  services: {
    ok: number;
    warn: number;
    crit: number;
    unknown: number;
    pending: number;
  };
  lastContact: string;
}

export interface AgentStatus {
  name: string;
  packageName: string;
  required: boolean;
  installed: boolean;
  running: boolean;
  version: string | null;
}

export interface CommandEntry {
  label: string;
  command: string;
  runFrom: string;
}

export interface LivenessSignal {
  source: string;
  alive: boolean;
  timestamp: string;
  detail: string;
}

export interface LivenessResult {
  alive: boolean;
  confidence: string;
  signals: LivenessSignal[];
  lastSeenAnywhere: string | null;
  deadSinceDays: number | null;
}

export interface Recommendation {
  id: number;
  hostFqdn: string;
  type: string;
  severity: string;
  description: string;
  systemTarget: string;
  commands: CommandEntry[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HostDetail {
  fqdn: string;
  ip: string;
  os: string;
  osCategory: OsCategory;
  arch: string;
  macAddress: string;
  lastPingAt: string | null;
  lastPingSuccess: boolean;
  status: string;
  satelliteRegistered: boolean;
  checkmkMonitored: boolean;
  dnsPresent: boolean;
  complianceScore: number;
  lastSeen: string;
  sources: string[];
  satellite: SatelliteData | null;
  checkmk: CheckmkData | null;
  dns: DnsData | null;
  agents: AgentStatus[];
  liveness: LivenessResult | null;
  recommendations: Recommendation[];
}

export interface DnsData {
  fqdn: string;
  forwardIp: string | null;
  reverseHostname: string | null;
  forwardMatch: boolean;
  reverseMatch: boolean;
  lastChecked: string;
}

export interface Discrepancy {
  fqdn: string;
  ip: string;
  type: 'missing_in_checkmk' | 'missing_in_satellite' | 'missing_in_dns' | 'dns_reverse_missing' | 'dns_forward_reverse_mismatch' | 'stale_entry' | 'orphan';
  description: string;
  system: string;
  suggestedAction: string;
  severity: 'high' | 'medium' | 'low';
}

export interface DiscrepancyResponse {
  data: Discrepancy[];
  total: number;
  filters: { type: string | null; severity: string | null };
}

export interface ComplianceEntry {
  fqdn: string;
  ip: string;
  os: string;
  status: string;
  complianceScore: number;
  agents: AgentStatus[];
}

export interface ComplianceResponse {
  data: ComplianceEntry[];
  total: number;
}

export interface Baseline {
  id: number;
  name: string;
  packageName: string;
  description: string;
  requiredForGroups: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BaselinesResponse {
  data: Baseline[];
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync: {
    id: number;
    source: string;
    status: string;
    hostsFound: number;
    hostsUpdated: number;
    errors: number;
    startedAt: string;
    completedAt: string;
  } | null;
}

export interface SyncHistoryEntry {
  id: number;
  source: string;
  status: string;
  hostsFound: number;
  hostsUpdated: number;
  errors: number;
  startedAt: string;
  completedAt: string;
}

export interface SyncHistoryResponse {
  data: SyncHistoryEntry[];
  total: number;
}

export interface SettingEntry {
  id: number;
  key: string;
  value: string;
  description: string;
}

export interface SettingsResponse {
  data: SettingEntry[];
}

export interface HostListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  source?: string;
  osCategory?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DiscrepancyParams {
  type?: string;
  severity?: string;
}

export interface RecommendationListParams {
  page?: number;
  pageSize?: number;
  type?: string;
  severity?: string;
  system?: string;
  search?: string;
  status?: string;
}

// --- API Functions ---

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', { username, password });
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await api.get<{ user: User }>('/auth/me');
  return response.data.user;
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await api.get<DashboardData>('/dashboard');
  return response.data;
}

export async function getHosts(params: HostListParams): Promise<PaginatedResponse<HostSummary>> {
  const response = await api.get<PaginatedResponse<HostSummary>>('/hosts', { params });
  return response.data;
}

export async function getHost(fqdn: string): Promise<HostDetail> {
  const response = await api.get<HostDetail>(`/hosts/${encodeURIComponent(fqdn)}`);
  return response.data;
}

export async function getHostAgents(fqdn: string): Promise<{ fqdn: string; complianceScore: number; agents: AgentStatus[] }> {
  const response = await api.get<{ fqdn: string; complianceScore: number; agents: AgentStatus[] }>(`/hosts/${encodeURIComponent(fqdn)}/agents`);
  return response.data;
}

export async function updateHostStatus(fqdn: string, status: string): Promise<{ message: string; host: { fqdn: string; status: string } }> {
  const response = await api.put<{ message: string; host: { fqdn: string; status: string } }>(`/hosts/${encodeURIComponent(fqdn)}/status`, { status });
  return response.data;
}

export async function setOsCategory(fqdn: string, osCategory: string): Promise<{ message: string; fqdn: string; osCategory: string }> {
  const response = await api.put<{ message: string; fqdn: string; osCategory: string }>(`/hosts/${encodeURIComponent(fqdn)}/os-category`, { osCategory });
  return response.data;
}

export async function getDiscrepancies(params: DiscrepancyParams): Promise<DiscrepancyResponse> {
  const response = await api.get<DiscrepancyResponse>('/discrepancies', { params });
  return response.data;
}

// --- Recommendations ---

export async function getRecommendations(params: RecommendationListParams): Promise<PaginatedResponse<Recommendation>> {
  const response = await api.get<PaginatedResponse<Recommendation>>('/recommendations', { params });
  return response.data;
}

export async function getRecommendationSummary(): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  bySystem: Record<string, number>;
}> {
  const response = await api.get('/recommendations/summary');
  return response.data;
}

export async function getRecommendationsByHost(fqdn: string): Promise<{ data: Recommendation[] }> {
  const response = await api.get<{ data: Recommendation[] }>(`/recommendations/by-host/${encodeURIComponent(fqdn)}`);
  return response.data;
}

export async function getRecommendationsBySystem(system: string): Promise<{ data: Recommendation[] }> {
  const response = await api.get<{ data: Recommendation[] }>(`/recommendations/by-system/${encodeURIComponent(system)}`);
  return response.data;
}

export async function getRecommendationCommands(system: string): Promise<string> {
  const response = await api.get(`/recommendations/commands/${encodeURIComponent(system)}`, { responseType: 'text' });
  return response.data;
}

export async function dismissRecommendation(id: number): Promise<Recommendation> {
  const response = await api.put<Recommendation>(`/recommendations/${id}/dismiss`);
  return response.data;
}

export async function resolveRecommendation(id: number): Promise<Recommendation> {
  const response = await api.put<Recommendation>(`/recommendations/${id}/resolve`);
  return response.data;
}

// --- Compliance ---

export async function getCompliance(): Promise<ComplianceResponse> {
  const response = await api.get<ComplianceResponse>('/compliance');
  return response.data;
}

export async function getBaselines(): Promise<BaselinesResponse> {
  const response = await api.get<BaselinesResponse>('/compliance/baselines');
  return response.data;
}

export async function createBaseline(data: Omit<Baseline, 'id' | 'createdAt' | 'updatedAt'>): Promise<Baseline> {
  const response = await api.post<Baseline>('/compliance/baselines', data);
  return response.data;
}

export async function updateBaseline(id: number, data: Partial<Baseline>): Promise<Baseline> {
  const response = await api.put<Baseline>(`/compliance/baselines/${id}`, data);
  return response.data;
}

export async function deleteBaseline(id: number): Promise<void> {
  await api.delete(`/compliance/baselines/${id}`);
}

export async function triggerSync(): Promise<{ message: string; startedAt: string; triggeredBy: string }> {
  const response = await api.post<{ message: string; startedAt: string; triggeredBy: string }>('/sync');
  return response.data;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const response = await api.get<SyncStatus>('/sync/status');
  return response.data;
}

export async function getSyncHistory(): Promise<SyncHistoryResponse> {
  const response = await api.get<SyncHistoryResponse>('/sync/history');
  return response.data;
}

export async function getSettings(): Promise<SettingsResponse> {
  const response = await api.get<SettingsResponse>('/settings');
  return response.data;
}

export async function updateSettings(settings: Record<string, string | number>): Promise<{ message: string; data: SettingEntry[] }> {
  const response = await api.put<{ message: string; data: SettingEntry[] }>('/settings', settings);
  return response.data;
}

// --- Host Collections ---

export interface HostCollection {
  id: number;
  name: string;
  description: string;
  organizationId: number;
  totalHosts: number;
  unlimitedHosts: boolean;
  maxHosts: number | null;
  hostIds: number[];
  hostFqdns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SatelliteHost {
  fqdn: string;
  satelliteId: number;
}

export interface Organization {
  id: number;
  name: string;
}

export async function getHostCollections(): Promise<{ data: HostCollection[]; total: number }> {
  const response = await api.get<{ data: HostCollection[]; total: number }>('/host-collections');
  return response.data;
}

export async function getOrganizations(): Promise<{ data: Organization[] }> {
  const response = await api.get<{ data: Organization[] }>('/host-collections/organizations');
  return response.data;
}

export async function getSatelliteHosts(): Promise<{ data: SatelliteHost[] }> {
  const response = await api.get<{ data: SatelliteHost[] }>('/host-collections/satellite-hosts');
  return response.data;
}

export interface MissingAgentHost {
  fqdn: string;
  satelliteId: number;
  ip: string;
  os: string;
}

export async function getHostsMissingAgent(agentName: string): Promise<{ data: MissingAgentHost[]; agentName: string; total: number }> {
  const response = await api.get<{ data: MissingAgentHost[]; agentName: string; total: number }>(
    `/host-collections/missing-agent/${encodeURIComponent(agentName)}`
  );
  return response.data;
}

export async function createHostCollection(data: {
  name: string;
  description: string;
  organizationId: number;
  hostIds: number[];
}): Promise<any> {
  const response = await api.post('/host-collections', data);
  return response.data;
}

export async function updateHostCollection(id: number, data: { name?: string; description?: string }): Promise<any> {
  const response = await api.put(`/host-collections/${id}`, data);
  return response.data;
}

export async function deleteHostCollection(id: number): Promise<void> {
  await api.delete(`/host-collections/${id}`);
}

export async function addHostsToCollection(id: number, hostIds: number[]): Promise<any> {
  const response = await api.put(`/host-collections/${id}/hosts`, { hostIds });
  return response.data;
}

export async function removeHostsFromCollection(id: number, hostIds: number[]): Promise<any> {
  const response = await api.delete(`/host-collections/${id}/hosts`, { data: { hostIds } });
  return response.data;
}

// --- Host Groups ---

export interface HostGroupHost {
  fqdn: string;
  ip: string;
  status: string;
}

export interface HostGroup {
  id: number;
  name: string;
  description: string;
  system: boolean;
  hostCount: number;
  hosts: HostGroupHost[];
  createdAt: string;
  updatedAt: string;
}

export async function getHostGroups(): Promise<{ data: HostGroup[]; total: number }> {
  const response = await api.get<{ data: HostGroup[]; total: number }>('/host-groups');
  return response.data;
}

export async function createHostGroup(data: { name: string; description: string }): Promise<HostGroup> {
  const response = await api.post<HostGroup>('/host-groups', data);
  return response.data;
}

export async function deleteHostGroup(id: number): Promise<void> {
  await api.delete(`/host-groups/${id}`);
}

export async function addHostsToGroup(id: number, fqdns: string[]): Promise<any> {
  const response = await api.put(`/host-groups/${id}/hosts`, { fqdns });
  return response.data;
}

export async function removeHostsFromGroup(id: number, fqdns: string[]): Promise<any> {
  const response = await api.delete(`/host-groups/${id}/hosts`, { data: { fqdns } });
  return response.data;
}

// --- User Management ---

export interface ManagedUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  hostGroups: Array<{ id: number; name: string; system: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export async function getUsers(): Promise<{ data: ManagedUser[]; total: number }> {
  const response = await api.get<{ data: ManagedUser[]; total: number }>('/users');
  return response.data;
}

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  role: string;
  hostGroupIds: number[];
}): Promise<any> {
  const response = await api.post('/users', data);
  return response.data;
}

export async function updateUser(id: number, data: {
  role?: string;
  email?: string;
  password?: string;
  hostGroupIds?: number[];
}): Promise<any> {
  const response = await api.put(`/users/${id}`, data);
  return response.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export default api;
