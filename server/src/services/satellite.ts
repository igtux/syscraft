import axios, { AxiosInstance } from 'axios';
import https from 'node:https';
import { config } from '../config.js';
import type { SatelliteHostData } from '../types/index.js';

const agent = new https.Agent({ rejectUnauthorized: false });

class SatelliteService {
  private client: AxiosInstance;

  constructor() {
    this.client = this.createClient(
      config.SATELLITE_URL,
      config.SATELLITE_USER,
      config.SATELLITE_PASSWORD,
    );
  }

  private createClient(url: string, user: string, password: string): AxiosInstance {
    return axios.create({
      baseURL: `${url}/api/v2`,
      httpsAgent: agent,
      auth: { username: user, password },
      headers: {
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
      const response = await this.client.get('/status');
      return response.status === 200;
    } catch (error) {
      console.log('[SysCraft] Satellite connection test failed:', (error as Error).message);
      return false;
    }
  }

  async fetchHosts(): Promise<SatelliteHostData[]> {
    const result = await this.fetchHostsRaw();
    return result.map((r) => r.parsed).filter((p): p is SatelliteHostData => p !== null);
  }

  async fetchHostsRaw(): Promise<Array<{ fqdn: string; ip: string; raw: any; parsed: SatelliteHostData | null }>> {
    const hosts: Array<{ fqdn: string; ip: string; raw: any; parsed: SatelliteHostData | null }> = [];
    let page = 1;
    const perPage = 250;
    let total = Infinity;

    try {
      while ((page - 1) * perPage < total) {
        const response = await this.client.get('/hosts', {
          params: { page, per_page: perPage },
        });

        const data = response.data;
        total = data.total || data.subtotal || 0;
        const results = data.results || [];

        for (const host of results) {
          const fqdn = host.name || host.fqdn || host.certname || `host-${host.id}`;
          const ip = host.ip || host.ip4 || '';
          const parsed = this.parseHost(host);
          hosts.push({ fqdn, ip, raw: host, parsed });
        }

        page++;

        if (results.length === 0) break;
      }

      console.log(`[SysCraft] Satellite: fetched ${hosts.length} hosts`);
      return hosts;
    } catch (error) {
      console.log('[SysCraft] Satellite fetchHosts error:', (error as Error).message);
      return hosts;
    }
  }

  async fetchHostDetails(hostIdOrFqdn: string | number): Promise<SatelliteHostData | null> {
    try {
      const response = await this.client.get(`/hosts/${hostIdOrFqdn}`);
      return this.parseHost(response.data);
    } catch (error) {
      console.log(`[SysCraft] Satellite fetchHostDetails(${hostIdOrFqdn}) error:`, (error as Error).message);
      return null;
    }
  }

  async fetchHostFacts(hostId: number): Promise<Record<string, string>> {
    try {
      const response = await this.client.get(`/hosts/${hostId}/facts`, {
        params: { per_page: 1000 },
      });
      const results = response.data.results || {};
      // Satellite returns facts nested under hostname: { "hostname.fqdn": { "cpu::cpu(s)": "8", ... } }
      // Flatten by iterating hostname -> fact entries, keeping fact keys as-is
      const flattened: Record<string, string> = {};
      for (const [_hostname, facts] of Object.entries(results)) {
        if (typeof facts === 'object' && facts !== null) {
          for (const [key, value] of Object.entries(facts as Record<string, unknown>)) {
            if (value !== null && value !== undefined) {
              flattened[key] = String(value);
            }
          }
        }
      }
      return flattened;
    } catch (error) {
      console.log(`[SysCraft] Satellite fetchHostFacts(${hostId}) error:`, (error as Error).message);
      return {};
    }
  }

  async fetchErrata(hostId: number): Promise<{ security: number; bugfix: number; enhancement: number }> {
    try {
      const response = await this.client.get(`/hosts/${hostId}/errata`, {
        params: { per_page: 1 },
      });

      const subtotals = response.data.subtotal || 0;
      const total = response.data.total || 0;

      let security = 0;
      let bugfix = 0;
      let enhancement = 0;

      if (response.data.subtotals) {
        security = response.data.subtotals.security || 0;
        bugfix = response.data.subtotals.bugfix || 0;
        enhancement = response.data.subtotals.enhancement || 0;
      } else {
        bugfix = subtotals || total;
      }

      return { security, bugfix, enhancement };
    } catch (error) {
      console.log(`[SysCraft] Satellite fetchErrata(${hostId}) error:`, (error as Error).message);
      return { security: 0, bugfix: 0, enhancement: 0 };
    }
  }

  async fetchHostPackages(hostIdOrFqdn: string | number): Promise<Array<{ name: string; version: string; release: string; arch: string }>> {
    try {
      const packages: Array<{ name: string; version: string; release: string; arch: string }> = [];
      let page = 1;
      const perPage = 250;
      let total = Infinity;

      while ((page - 1) * perPage < total) {
        const response = await this.client.get(`/hosts/${hostIdOrFqdn}/packages`, {
          params: { page, per_page: perPage },
        });

        total = response.data.total || response.data.subtotal || 0;
        const results = response.data.results || [];

        for (const pkg of results) {
          packages.push({
            name: pkg.name || pkg.nvra?.split('-')[0] || '',
            version: pkg.version || '',
            release: pkg.release || '',
            arch: pkg.arch || '',
          });
        }

        page++;
        if (results.length === 0) break;
      }

      return packages;
    } catch (error) {
      console.log(`[SysCraft] Satellite fetchHostPackages(${hostIdOrFqdn}) error:`, (error as Error).message);
      return [];
    }
  }

  async getHostCount(): Promise<number> {
    try {
      const response = await this.client.get('/hosts', {
        params: { per_page: 1, page: 1 },
      });
      return response.data.total || response.data.subtotal || 0;
    } catch (error) {
      console.log('[SysCraft] Satellite getHostCount error:', (error as Error).message);
      return 0;
    }
  }

  getRawHostData(host: any): string {
    return JSON.stringify(host);
  }

  // --- Host Collections (Katello API) ---

  private get katelloClient(): AxiosInstance {
    // Katello endpoints live under /katello/api/v2 instead of /api/v2
    const baseURL = this.client.defaults.baseURL!.replace('/api/v2', '/katello/api/v2');
    return axios.create({
      ...this.client.defaults,
      baseURL,
    });
  }

  async fetchHostCollections(orgId?: number): Promise<any[]> {
    try {
      const params: Record<string, any> = { per_page: 250 };
      if (orgId) params.organization_id = orgId;
      const response = await this.katelloClient.get('/host_collections', { params });
      return response.data.results || [];
    } catch (error) {
      console.log('[SysCraft] Satellite fetchHostCollections error:', (error as Error).message);
      return [];
    }
  }

  async getHostCollection(id: number): Promise<any | null> {
    try {
      const response = await this.katelloClient.get(`/host_collections/${id}`);
      return response.data;
    } catch (error) {
      console.log(`[SysCraft] Satellite getHostCollection(${id}) error:`, (error as Error).message);
      return null;
    }
  }

  async createHostCollection(orgId: number, name: string, description: string): Promise<any> {
    const response = await this.katelloClient.post('/host_collections', {
      organization_id: orgId,
      name,
      description,
    });
    return response.data;
  }

  async updateHostCollection(id: number, data: { name?: string; description?: string }): Promise<any> {
    const response = await this.katelloClient.put(`/host_collections/${id}`, data);
    return response.data;
  }

  async deleteHostCollection(id: number): Promise<void> {
    await this.katelloClient.delete(`/host_collections/${id}`);
  }

  async addHostsToCollection(collectionId: number, hostIds: number[]): Promise<any> {
    const response = await this.katelloClient.put(
      `/host_collections/${collectionId}/add_hosts`,
      { host_ids: hostIds },
    );
    return response.data;
  }

  async removeHostsFromCollection(collectionId: number, hostIds: number[]): Promise<any> {
    const response = await this.katelloClient.put(
      `/host_collections/${collectionId}/remove_hosts`,
      { host_ids: hostIds },
    );
    return response.data;
  }

  async getOrganizations(): Promise<Array<{ id: number; name: string }>> {
    try {
      const response = await this.client.get('/organizations', { params: { per_page: 250 } });
      return (response.data.results || []).map((o: any) => ({ id: o.id, name: o.name }));
    } catch (error) {
      console.log('[SysCraft] Satellite getOrganizations error:', (error as Error).message);
      return [];
    }
  }

  async enrichWithFacts(hostId: number, parsed: SatelliteHostData): Promise<SatelliteHostData> {
    try {
      const facts = await this.fetchHostFacts(hostId);

      // CPU count from facts (two formats: subscription-manager vs Puppet)
      if (!parsed.cpuCount) {
        const cpuFact = facts['cpu::cpu(s)'] || facts['lscpu::cpu(s)'] || facts['processors::count'] || facts['processors::physicalcount'];
        if (cpuFact) {
          parsed.cpuCount = parseInt(String(cpuFact), 10) || 0;
        }
      }

      // RAM from facts (two formats: memtotal in kB, or total_bytes)
      if (!parsed.ramMb) {
        const memFactKb = facts['memory::memtotal'];
        const memFactBytes = facts['memory::system::total_bytes'];
        if (memFactKb) {
          parsed.ramMb = Math.round(parseInt(String(memFactKb), 10) / 1024);
        } else if (memFactBytes) {
          parsed.ramMb = Math.round(parseInt(String(memFactBytes), 10) / (1024 * 1024));
        }
      }

      // Kernel from facts
      if (!parsed.kernel) {
        parsed.kernel = facts['uname::release'] || facts['kernelrelease'] || '';
      }

      return parsed;
    } catch (error) {
      console.log(`[SysCraft] Satellite enrichWithFacts(${hostId}) error:`, (error as Error).message);
      return parsed;
    }
  }

  private parseHost(host: any): SatelliteHostData | null {
    if (!host) return null;

    try {
      const hostGroup = host.hostgroup_name || host.hostgroup_title || '';
      const org = host.organization_name || '';
      const location = host.location_name || '';

      const contentFacet = host.content_facet_attributes || {};
      const subscriptionFacet = host.subscription_facet_attributes || {};

      // Extract MAC address from host.mac or interfaces
      const macAddress = host.mac || '';

      return {
        hostId: host.id,
        hostGroup,
        organization: org,
        location,
        lifecycleEnv: contentFacet.lifecycle_environment_name || contentFacet.lifecycle_environment?.name || '',
        contentView: contentFacet.content_view_name || contentFacet.content_view?.name || '',
        subscriptionStatus: subscriptionFacet.subscription_status_label || subscriptionFacet.subscription_status || '',
        cpuCount: host.cpus || 0,
        ramMb: host.ram ? parseInt(String(host.ram), 10) : 0,
        kernel: host.kernel || '',
        arch: host.architecture_name || host.arch || '',
        osName: host.operatingsystem_name || '',
        registered: !!host.content_facet_attributes,
        macAddress,
        errata: {
          security: contentFacet.errata_counts?.security || 0,
          bugfix: contentFacet.errata_counts?.bugfix || 0,
          enhancement: contentFacet.errata_counts?.enhancement || 0,
        },
        installedPackages: contentFacet.applicable_package_count || contentFacet.upgradable_package_count || 0,
        lastCheckin: host.last_report || subscriptionFacet.last_checkin || host.updated_at || '',
        createdAt: host.created_at || '',
      };
    } catch (error) {
      console.log('[SysCraft] Satellite parseHost error:', (error as Error).message);
      return null;
    }
  }
}

export const satelliteService = new SatelliteService();
