import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';
import type { CheckmkHostData } from '../types/index.js';

class CheckmkService {
  private client: AxiosInstance;

  constructor() {
    this.client = this.createClient(config.CHECKMK_URL, config.CHECKMK_USER, config.CHECKMK_PASSWORD);
  }

  private createClient(url: string, user: string, password: string): AxiosInstance {
    return axios.create({
      baseURL: url,
      headers: {
        Authorization: `Bearer ${user} ${password}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });
  }

  reconfigure(url: string, user: string, password: string): void {
    this.client = this.createClient(url, user, password);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/domain-types/host_config/collections/all');
      return response.status === 200;
    } catch (error) {
      console.log('[SysCraft] Checkmk connection test failed:', (error as Error).message);
      return false;
    }
  }

  async fetchHosts(): Promise<CheckmkHostData[]> {
    try {
      const [configResponse, statusData] = await Promise.all([
        this.client.get('/domain-types/host_config/collections/all'),
        this.fetchHostStatus(),
      ]);

      const configHosts = configResponse.data.value || [];
      const statusMap = new Map<string, any>();

      for (const s of statusData) {
        statusMap.set(s.hostname, s);
      }

      const hosts: CheckmkHostData[] = [];

      for (const host of configHosts) {
        const hostname = host.id || host.title || '';
        const extensions = host.extensions || {};
        const folder = extensions.folder || host.links?.find((l: any) => l.rel === 'urn:com.checkmk:rels/folder_config')?.href || '/';

        const status = statusMap.get(hostname);

        const parsed: CheckmkHostData = {
          hostname,
          folder: typeof folder === 'string' ? folder : String(folder),
          status: this.mapState(status?.state),
          agentType: extensions.tag_agent || extensions.attributes?.tag_agent || 'cmk-agent',
          services: status?.services || { ok: 0, warn: 0, crit: 0, unknown: 0, pending: 0 },
          lastContact: status?.lastContact || new Date().toISOString(),
        };

        hosts.push(parsed);
      }

      console.log(`[SysCraft] Checkmk: fetched ${hosts.length} hosts`);
      return hosts;
    } catch (error) {
      console.log('[SysCraft] Checkmk fetchHosts error:', (error as Error).message);
      return [];
    }
  }

  async fetchHostStatus(): Promise<Array<{
    hostname: string;
    state: number;
    services: { ok: number; warn: number; crit: number; unknown: number; pending: number };
    lastContact: string;
  }>> {
    try {
      const response = await this.client.get('/domain-types/host/collections/all', {
        params: {
          columns: ['name', 'state', 'num_services', 'num_services_ok', 'num_services_warn', 'num_services_crit', 'num_services_unknown', 'num_services_pending', 'last_check'],
        },
        paramsSerializer: (params) => {
          const parts: string[] = [];
          for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                parts.push(`${key}=${encodeURIComponent(v)}`);
              }
            } else {
              parts.push(`${key}=${encodeURIComponent(String(value))}`);
            }
          }
          return parts.join('&');
        },
      });

      const results = response.data.value || [];
      return results.map((host: any) => {
        const extensions = host.extensions || {};
        return {
          hostname: host.id || extensions.name || '',
          state: extensions.state ?? 3,
          services: {
            ok: extensions.num_services_ok || 0,
            warn: extensions.num_services_warn || 0,
            crit: extensions.num_services_crit || 0,
            unknown: extensions.num_services_unknown || 0,
            pending: extensions.num_services_pending || 0,
          },
          lastContact: extensions.last_check
            ? new Date(extensions.last_check * 1000).toISOString()
            : new Date().toISOString(),
        };
      });
    } catch (error) {
      console.log('[SysCraft] Checkmk fetchHostStatus error:', (error as Error).message);
      return [];
    }
  }

  async fetchServiceStatus(hostname: string): Promise<Array<{
    description: string;
    state: number;
    stateType: string;
    output: string;
  }>> {
    try {
      const response = await this.client.get(`/objects/host/${hostname}/collections/services`);
      const results = response.data.value || [];

      return results.map((svc: any) => {
        const ext = svc.extensions || {};
        return {
          description: ext.description || svc.title || '',
          state: ext.state ?? 3,
          stateType: ext.state_type === 1 ? 'hard' : 'soft',
          output: ext.plugin_output || '',
        };
      });
    } catch (error) {
      console.log(`[SysCraft] Checkmk fetchServiceStatus(${hostname}) error:`, (error as Error).message);
      return [];
    }
  }

  async getHostCount(): Promise<number> {
    try {
      const response = await this.client.get('/domain-types/host_config/collections/all');
      return (response.data.value || []).length;
    } catch (error) {
      console.log('[SysCraft] Checkmk getHostCount error:', (error as Error).message);
      return 0;
    }
  }

  private mapState(state: number | undefined): 'UP' | 'DOWN' | 'UNREACHABLE' | 'PENDING' {
    switch (state) {
      case 0:
        return 'UP';
      case 1:
        return 'DOWN';
      case 2:
        return 'UNREACHABLE';
      default:
        return 'PENDING';
    }
  }
}

export const checkmkService = new CheckmkService();
