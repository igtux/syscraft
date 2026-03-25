import type { CommandEntry, RecommendationType } from '../types/index.js';

interface CommandContext {
  fqdn: string;
  hostname: string;
  ip: string;
  satelliteUrl: string;
  satelliteOrg: string;
  activationKey: string;
  checkmkUrl: string;
  checkmkUser: string;
  checkmkPassword: string;
  systemsPresent: string[];
}

export function generateCommands(
  type: RecommendationType,
  ctx: CommandContext,
  settings: Map<string, string>
): CommandEntry[] {
  const commands: CommandEntry[] = [];
  const checkmkSite = ctx.checkmkUrl.replace(/\/api\/1\.0$/, '');

  switch (type) {
    case 'register_satellite':
      commands.push({
        label: 'Register host with Satellite via REX',
        command: `hammer job-invocation create --job-template 'Run Command - Script Default' --inputs command='subscription-manager register --org="${ctx.satelliteOrg}" --activationkey="${ctx.activationKey}" --force' --search-query 'name ~ ${ctx.fqdn}'`,
        runFrom: 'satellite.ailab.local',
      });
      break;

    case 'add_checkmk':
      commands.push({
        label: 'Add host to Checkmk',
        command: `curl -s -X POST '${ctx.checkmkUrl}/domain-types/host_config/collections/all' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"host_name":"${ctx.hostname}","folder":"/","attributes":{"ipaddress":"${ctx.ip}"}}'`,
        runFrom: 'satellite.ailab.local',
      });
      commands.push({
        label: 'Activate Checkmk changes',
        command: `curl -s -X POST '${ctx.checkmkUrl}/domain-types/activation_run/actions/activate-changes/invoke' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"force_foreign_changes":true}'`,
        runFrom: 'satellite.ailab.local',
      });
      break;

    case 'remove_checkmk':
      commands.push({
        label: 'Remove host from Checkmk',
        command: `curl -s -X DELETE '${ctx.checkmkUrl}/objects/host_config/${ctx.hostname}' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}'`,
        runFrom: 'satellite.ailab.local',
      });
      commands.push({
        label: 'Activate Checkmk changes',
        command: `curl -s -X POST '${ctx.checkmkUrl}/domain-types/activation_run/actions/activate-changes/invoke' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"force_foreign_changes":true}'`,
        runFrom: 'satellite.ailab.local',
      });
      break;

    case 'remove_satellite':
      commands.push({
        label: 'Delete host from Satellite',
        command: `hammer host delete --name ${ctx.fqdn}`,
        runFrom: 'satellite.ailab.local',
      });
      break;

    case 'install_agent':
      commands.push({
        label: 'Install monitoring agent via REX',
        command: `hammer job-invocation create --job-template 'Run Command - Script Default' --inputs command='dnf install -y check-mk-agent && systemctl enable --now check-mk-agent.socket' --search-query 'name ~ ${ctx.fqdn}'`,
        runFrom: 'satellite.ailab.local',
      });
      break;

    case 'cleanup_dead': {
      if (ctx.systemsPresent.includes('satellite')) {
        commands.push({
          label: 'Remove from Satellite',
          command: `hammer host delete --name ${ctx.fqdn}`,
          runFrom: 'satellite.ailab.local',
        });
      }
      if (ctx.systemsPresent.includes('checkmk')) {
        commands.push({
          label: 'Remove from Checkmk',
          command: `curl -s -X DELETE '${ctx.checkmkUrl}/objects/host_config/${ctx.hostname}' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}'`,
          runFrom: 'satellite.ailab.local',
        });
        commands.push({
          label: 'Activate Checkmk changes',
          command: `curl -s -X POST '${ctx.checkmkUrl}/domain-types/activation_run/actions/activate-changes/invoke' \\\n  -H 'Authorization: Bearer ${ctx.checkmkUser} ${ctx.checkmkPassword}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"force_foreign_changes":true}'`,
          runFrom: 'satellite.ailab.local',
        });
      }
      break;
    }

    case 'classify_os':
      commands.push({
        label: 'Set OS category in SysCraft UI',
        command: '(Manual action — classify OS in Host Detail page)',
        runFrom: 'SysCraft UI',
      });
      break;

    case 'add_dns':
      commands.push({
        label: 'Add DNS A record (PowerShell — future)',
        command: `# Add-DnsServerResourceRecordA -Name "${ctx.hostname}" -ZoneName "${settings.get('dns_zone') || 'ailab.local'}" -IPv4Address "${ctx.ip}" -ComputerName <dns-server>`,
        runFrom: 'AD DNS server',
      });
      break;

    case 'remove_dns':
      commands.push({
        label: 'Remove DNS record (PowerShell — future)',
        command: `# Remove-DnsServerResourceRecord -Name "${ctx.hostname}" -ZoneName "${settings.get('dns_zone') || 'ailab.local'}" -RRType A -Force -ComputerName <dns-server>`,
        runFrom: 'AD DNS server',
      });
      break;

    case 'fix_dns_reverse':
      commands.push({
        label: 'Create reverse PTR record (PowerShell — future)',
        command: `# Add-DnsServerResourceRecordPtr -Name "<reverse-ip>" -ZoneName "<reverse-zone>" -PtrDomainName "${ctx.fqdn}" -ComputerName <dns-server>`,
        runFrom: 'AD DNS server',
      });
      break;

    case 'fix_dns_mismatch':
      commands.push({
        label: 'Fix DNS forward/reverse mismatch (PowerShell — future)',
        command: `# Update the PTR record to match the A record for ${ctx.fqdn}`,
        runFrom: 'AD DNS server',
      });
      break;

    case 'ip_reuse':
      commands.push({
        label: 'Investigate IP reuse',
        command: '(Manual investigation required — verify if this is a legitimate IP change or a conflict)',
        runFrom: 'SysCraft UI',
      });
      break;

    case 'vm_powered_off':
      commands.push({
        label: 'VM is powered off — consider cleanup or archival',
        command: '(Review in vSphere Client — power on, archive, or delete the VM)',
        runFrom: 'vSphere Client',
      });
      break;
  }

  return commands;
}
