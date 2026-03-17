import type { OsCategory, SourceType } from '../types/index.js';

const LINUX_PATTERNS = [
  /rhel/i, /red\s*hat/i, /centos/i, /ubuntu/i, /debian/i, /fedora/i,
  /suse/i, /alma/i, /rocky/i, /oracle\s*linux/i, /linux/i,
];

const WINDOWS_PATTERNS = [
  /windows/i, /win\s*server/i, /microsoft/i,
];

const APPLIANCE_FQDN_PATTERNS = [
  /^esx/i, /^vcsa/i, /^vc-/i, /^vsphere/i,
  /^fw[.-]/i, /^firewall/i, /^palo/i, /^fortinet/i,
  /^switch/i, /^sw[.-]/i, /^ap[.-]/i,
  /^netapp/i, /^nas[.-]/i, /^san[.-]/i,
  /^idrac/i, /^ilo/i, /^ipmi/i, /^bmc/i,
];

export function classifyOs(
  osName: string,
  agentType: string,
  fqdn: string
): OsCategory {
  // 1. Check Satellite osName
  if (osName) {
    for (const pattern of LINUX_PATTERNS) {
      if (pattern.test(osName)) return 'linux';
    }
    for (const pattern of WINDOWS_PATTERNS) {
      if (pattern.test(osName)) return 'windows';
    }
  }

  // 2. Check Checkmk agentType
  if (agentType) {
    const lower = agentType.toLowerCase();
    if (lower.includes('cmk-agent') || lower.includes('check-mk-agent') || lower.includes('check_mk_agent')) {
      return 'linux';
    }
    if (lower.includes('snmp') || lower.includes('special')) {
      return 'appliance';
    }
  }

  // 3. FQDN heuristics
  for (const pattern of APPLIANCE_FQDN_PATTERNS) {
    if (pattern.test(fqdn)) return 'appliance';
  }

  return 'unknown';
}

export function getExpectedSystems(osCategory: OsCategory): SourceType[] {
  switch (osCategory) {
    case 'linux':
      return ['satellite', 'checkmk', 'dns'];
    case 'windows':
      return ['checkmk', 'dns'];
    case 'appliance':
      return ['checkmk', 'dns'];
    case 'unknown':
      return [];
  }
}
