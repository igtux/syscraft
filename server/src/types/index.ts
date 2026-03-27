export type HostStatus = 'active' | 'partial' | 'stale' | 'new' | 'decommissioning';
export type SourceType = 'satellite' | 'checkmk' | 'dns' | 'vcsa';
export type UserRole = 'admin' | 'user';
export type OsCategory = 'linux' | 'windows' | 'appliance' | 'unknown';
export type RecommendationType =
  | 'register_satellite'
  | 'add_checkmk'
  | 'remove_checkmk'
  | 'remove_satellite'
  | 'install_agent'
  | 'cleanup_dead'
  | 'classify_os'
  | 'ip_reuse'
  | 'add_dns'
  | 'remove_dns'
  | 'fix_dns_reverse'
  | 'fix_dns_mismatch'
  | 'vm_powered_off';

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
  type: RecommendationType;
  severity: string;
  description: string;
  systemTarget: string;
  commands: CommandEntry[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HostSummary {
  fqdn: string;
  ip: string;
  os: string;
  osCategory: OsCategory;
  status: HostStatus;
  satelliteRegistered: boolean;
  checkmkMonitored: boolean;
  dnsPresent: boolean;
  complianceScore: number;
  lastPingSuccess: boolean;
  lastSeen: string;
  sources: SourceType[];
}

export interface DnsHostData {
  fqdn: string;
  forwardIp: string | null;
  reverseHostname: string | null;
  forwardMatch: boolean;
  reverseMatch: boolean;
  lastChecked: string;
}

export interface HostDetail extends HostSummary {
  arch: string;
  macAddress: string;
  lastPingAt: string | null;
  satellite: SatelliteHostData | null;
  checkmk: CheckmkHostData | null;
  dns: DnsHostData | null;
  agents: AgentStatusInfo[];
  liveness: LivenessResult | null;
  recommendations: Recommendation[];
}

export interface SatelliteHostData {
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
  osName: string;
  registered: boolean;
  macAddress: string;
  errata: { security: number; bugfix: number; enhancement: number };
  installedPackages: number;
  lastCheckin: string;
  createdAt: string;
}

export interface CheckmkHostData {
  hostname: string;
  folder: string;
  status: 'UP' | 'DOWN' | 'UNREACHABLE' | 'PENDING';
  agentType: string;
  services: { ok: number; warn: number; crit: number; unknown: number; pending: number };
  lastContact: string;
}

export interface AgentStatusInfo {
  name: string;
  packageName: string;
  required: boolean;
  installed: boolean;
  running: boolean;
  version: string | null;
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
  recommendationSummary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
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
  vcsaInfrastructure: VcsaInfrastructure | null;
}

export interface SystemStatus {
  name: string;
  type: SourceType;
  connected: boolean;
  lastSync: string | null;
  hostCount: number;
  error: string | null;
}

export interface AuditEvent {
  id: number;
  action: string;
  target: string;
  details: any;
  createdAt: string;
  username: string | null;
}

export interface SyncResult {
  source: string;
  hostsFound: number;
  hostsUpdated: number;
  errors: string[];
  duration: number;
}

export interface VcsaVmData {
  vmName: string;
  vmId: string;
  powerState: string;
  os: string | null;
  osFamily: string | null;
  ip: string | null;
  mac: string | null;
  cpuCount: number;
  ramMb: number;
  diskGb: number;
  guestToolsRunning: boolean;
}

export interface VcsaInfrastructure {
  esxiHosts: Array<{ name: string; connectionState: string; powerState: string }>;
  datastores: Array<{ name: string; type: string; capacityBytes: number; freeSpaceBytes: number; usedPercent: number }>;
  networks: Array<{ name: string; type: string }>;
  vmCount: number;
  vmPoweredOn: number;
  vmPoweredOff: number;
}

export type HostEventType =
  | 'host_discovered'
  | 'source_added'
  | 'source_removed'
  | 'status_changed'
  | 'liveness_changed'
  | 'os_changed'
  | 'recommendation_created'
  | 'recommendation_resolved'
  | 'recommendation_dismissed'
  | 'ping_changed'
  | 'ip_changed'
  | 'mac_changed';

export type WebhookEventType =
  | 'recommendation_critical'
  | 'recommendation_high'
  | 'source_down'
  | 'host_stale'
  | 'host_discovered'
  | 'liveness_changed'
  | 'sync_completed'
  | 'daily_summary';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
