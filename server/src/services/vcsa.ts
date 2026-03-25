import https from 'node:https';
import http from 'node:http';

// Custom fetch wrapper that ignores self-signed certificates for vCSA
function vcsaFetch(url: string, options: RequestInit & { headers?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; statusText: string; text: () => Promise<string>; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Request timed out')); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

interface VcsaVmSummary {
  vm: string;
  name: string;
  power_state: string;
  cpu_count: number;
  memory_size_MiB: number;
}

interface VcsaGuestIdentity {
  name: string;
  family: string;
  full_name: { default_message: string };
  ip_address: string;
  host_name: string;
}

interface VcsaNic {
  nic: string;
  mac_address: string;
  ip: { ip_addresses: Array<{ ip_address: string; prefix_length: number; state: string }> };
}

export interface EnrichedVM {
  vmId: string;
  vmName: string;
  powerState: string;
  cpuCount: number;
  ramMb: number;
  guest: {
    osFamily: string | null;
    osFullName: string | null;
    ip: string | null;
    hostname: string | null;
    toolsRunning: boolean;
  };
  nics: Array<{ mac: string; ips: string[] }>;
}

export interface VcsaEsxiHost {
  hostId: string;
  name: string;
  connectionState: string;
  powerState: string;
}

export interface VcsaDatastore {
  datastoreId: string;
  name: string;
  type: string;
  capacityBytes: number;
  freeSpaceBytes: number;
  usedPercent: number;
}

export interface VcsaNetwork {
  networkId: string;
  name: string;
  type: string;
}

class VcsaService {
  private url = '';
  private user = '';
  private password = '';
  private sessionToken: string | null = null;

  reconfigure(url: string, user: string, password: string): void {
    // Strip trailing slash
    this.url = url.replace(/\/+$/, '');
    this.user = user;
    this.password = password;
    this.sessionToken = null;
  }

  private async request<T>(path: string, method = 'GET', body?: any): Promise<T> {
    const url = `${this.url}${path}`;

    if (!this.sessionToken && !path.includes('/api/session')) {
      await this.createSession();
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionToken) {
      headers['vmware-api-session-id'] = this.sessionToken;
    }

    const response = await vcsaFetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && !path.includes('/api/session')) {
      // Session expired — re-auth and retry once
      this.sessionToken = null;
      await this.createSession();
      headers['vmware-api-session-id'] = this.sessionToken!;
      const retry = await vcsaFetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (!retry.ok) throw new Error(`vCSA API ${method} ${path}: ${retry.status} ${retry.statusText}`);
      return retry.json() as Promise<T>;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`vCSA API ${method} ${path}: ${response.status} ${response.statusText} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private async createSession(): Promise<void> {
    const url = `${this.url}/api/session`;
    const response = await vcsaFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64'),
      },
    });

    if (!response.ok) {
      throw new Error(`vCSA auth failed: ${response.status} ${response.statusText}`);
    }

    const token = await response.text();
    this.sessionToken = token.replace(/"/g, '');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.createSession();
      const vms = await this.request<VcsaVmSummary[]>('/api/vcenter/vm');
      return Array.isArray(vms);
    } catch (error) {
      console.log('[SysCraft] vCSA test connection failed:', (error as Error).message);
      return false;
    }
  }

  async fetchVMs(): Promise<VcsaVmSummary[]> {
    return this.request<VcsaVmSummary[]>('/api/vcenter/vm');
  }

  async fetchVMGuestIdentity(vmId: string): Promise<VcsaGuestIdentity | null> {
    try {
      return await this.request<VcsaGuestIdentity>(`/api/vcenter/vm/${vmId}/guest/identity`);
    } catch {
      // Tools not running or VM powered off
      return null;
    }
  }

  async fetchVMNetworkInterfaces(vmId: string): Promise<VcsaNic[]> {
    try {
      return await this.request<VcsaNic[]>(`/api/vcenter/vm/${vmId}/guest/networking/interfaces`);
    } catch {
      return [];
    }
  }

  async fetchHosts(): Promise<VcsaEsxiHost[]> {
    const raw = await this.request<Array<{ host: string; name: string; connection_state: string; power_state: string }>>('/api/vcenter/host');
    return raw.map((h) => ({
      hostId: h.host,
      name: h.name,
      connectionState: h.connection_state,
      powerState: h.power_state,
    }));
  }

  async fetchDatastores(): Promise<VcsaDatastore[]> {
    const raw = await this.request<Array<{ datastore: string; name: string; type: string; capacity: number; free_space: number }>>('/api/vcenter/datastore');
    return raw.map((d) => ({
      datastoreId: d.datastore,
      name: d.name,
      type: d.type,
      capacityBytes: d.capacity,
      freeSpaceBytes: d.free_space,
      usedPercent: d.capacity > 0 ? Math.round(((d.capacity - d.free_space) / d.capacity) * 100) : 0,
    }));
  }

  async fetchNetworks(): Promise<VcsaNetwork[]> {
    const raw = await this.request<Array<{ network: string; name: string; type: string }>>('/api/vcenter/network');
    return raw.map((n) => ({
      networkId: n.network,
      name: n.name,
      type: n.type,
    }));
  }

  async fetchAllVMsEnriched(): Promise<EnrichedVM[]> {
    const vms = await this.fetchVMs();
    const enriched: EnrichedVM[] = [];

    for (const vm of vms) {
      const guest = await this.fetchVMGuestIdentity(vm.vm);
      const nics = await this.fetchVMNetworkInterfaces(vm.vm);

      // Get primary MAC and IPs from NICs
      const nicData = nics.map((n) => ({
        mac: n.mac_address || '',
        ips: (n.ip?.ip_addresses || [])
          .filter((a) => a.state === 'PREFERRED' && !a.ip_address.includes(':'))
          .map((a) => a.ip_address),
      }));

      enriched.push({
        vmId: vm.vm,
        vmName: vm.name,
        powerState: vm.power_state,
        cpuCount: vm.cpu_count,
        ramMb: vm.memory_size_MiB,
        guest: {
          osFamily: guest?.family || null,
          osFullName: guest?.full_name?.default_message || null,
          ip: guest?.ip_address || null,
          hostname: guest?.host_name || null,
          toolsRunning: guest !== null,
        },
        nics: nicData,
      });
    }

    return enriched;
  }
}

export const vcsaService = new VcsaService();
