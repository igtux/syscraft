import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seed(): Promise<void> {
  console.log('[SysCraft] Running database seed...');

  // Check if users already exist (idempotent)
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log('[SysCraft] Seed skipped: database already has users');

    // Still ensure new items exist (idempotent additions)
    await seedDataSources();
    await seedRecommendationSettings();
    return;
  }

  // Create default admin user
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash('syscraft', salt);

  await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@syscraft.local',
      passwordHash,
      role: 'admin',
    },
  });

  const userHash = await bcrypt.hash('syscraft', salt);
  await prisma.user.create({
    data: {
      username: 'user',
      email: 'user@syscraft.local',
      passwordHash: userHash,
      role: 'user',
    },
  });
  console.log('[SysCraft] Created default users: admin / syscraft (admin), user / syscraft (user)');

  // Create default agent baselines
  const baselines = [
    {
      name: 'subscription-manager',
      packageName: 'subscription-manager',
      description: 'Red Hat Satellite registration agent — manages system subscriptions and repository access.',
      requiredForGroups: JSON.stringify(['all']),
      enabled: true,
    },
    {
      name: 'katello-host-tools',
      packageName: 'katello-host-tools',
      description: 'Satellite content management tools — enables package and errata management from Satellite.',
      requiredForGroups: JSON.stringify(['all']),
      enabled: true,
    },
    {
      name: 'check-mk-agent',
      packageName: 'check-mk-agent',
      description: 'Checkmk monitoring agent — reports system health and service status to the monitoring server.',
      requiredForGroups: JSON.stringify(['all']),
      enabled: true,
    },
    {
      name: 'insights-client',
      packageName: 'insights-client',
      description: 'Red Hat Insights client — provides proactive security, compliance, and performance analysis.',
      requiredForGroups: JSON.stringify(['all']),
      enabled: true,
    },
    {
      name: 'rsync',
      packageName: 'rsync',
      description: 'File transfer utility — required for efficient remote file synchronization and backup operations.',
      requiredForGroups: JSON.stringify(['all']),
      enabled: true,
    },
  ];

  for (const baseline of baselines) {
    await prisma.agentBaseline.create({ data: baseline });
  }
  console.log(`[SysCraft] Created ${baselines.length} default agent baselines`);

  // Create default settings
  const settings = [
    { key: 'sync_interval_minutes', value: '15', description: 'How often (in minutes) the system automatically syncs host data from all sources.' },
    { key: 'stale_threshold_hours', value: '72', description: 'Number of hours after which a host with no check-in is marked as stale.' },
    { key: 'satellite_url', value: 'https://satellite.ailab.local', description: 'URL of the Red Hat Satellite / Foreman API server.' },
    { key: 'satellite_user', value: 'admin', description: 'Username for Satellite API authentication.' },
    { key: 'satellite_password', value: 'uwx9UVoUCfVdavna', description: 'Password for Satellite API authentication.' },
    { key: 'checkmk_url', value: 'http://satellite.ailab.local:8080/cmk/check_mk/api/1.0', description: 'URL of the Checkmk REST API endpoint.' },
    { key: 'checkmk_user', value: 'grafana', description: 'Automation username for Checkmk API authentication.' },
    { key: 'checkmk_password', value: 'grafana-auto-secret', description: 'Automation secret for Checkmk API authentication.' },
    { key: 'auto_sync_enabled', value: 'true', description: 'Whether automatic periodic sync is enabled.' },
    { key: 'compliance_threshold', value: '80', description: 'Minimum compliance score (0-100) for a host to be considered compliant.' },
    { key: 'dns_enabled', value: 'false', description: 'Enable DNS record validation for hosts during sync.' },
    { key: 'dns_server', value: '127.0.0.1', description: 'IP address of the DNS server to query for host record validation.' },
    { key: 'dns_port', value: '53', description: 'Port of the DNS server.' },
    { key: 'dns_zone', value: 'ailab.local', description: 'DNS zone name used for SOA connectivity test.' },
    { key: 'dns_batch_size', value: '20', description: 'Number of concurrent DNS queries per batch.' },
    { key: 'dns_batch_delay_ms', value: '100', description: 'Delay in milliseconds between DNS query batches.' },
    { key: 'cleanup_threshold_days', value: '7', description: 'Days a host must be unreachable before recommending cleanup from all systems.' },
    { key: 'ping_enabled', value: 'true', description: 'Enable ICMP ping liveness checks during sync.' },
    { key: 'ping_timeout_ms', value: '3000', description: 'Ping timeout in milliseconds per host.' },
    { key: 'ping_batch_size', value: '10', description: 'Number of concurrent pings per batch.' },
  ];

  for (const setting of settings) {
    await prisma.setting.create({ data: setting });
  }
  console.log(`[SysCraft] Created ${settings.length} default settings`);

  // Create default host group and assign both users
  const allHostsGroup = await prisma.hostGroup.create({
    data: {
      name: 'All Hosts',
      description: 'System-managed group — automatically contains every discovered host.',
      system: true,
    },
  });

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) {
    await prisma.userHostGroup.create({
      data: { userId: u.id, groupId: allHostsGroup.id },
    });
  }
  console.log('[SysCraft] Created default host group: All Hosts (assigned to all users)');

  // Seed data sources and recommendation settings
  await seedDataSources();
  await seedRecommendationSettings();

  // Audit log for seed
  await prisma.auditLog.create({
    data: {
      action: 'database_seeded',
      target: 'system',
      details: {
        users: 2,
        baselines: baselines.length,
        settings: settings.length,
        hostGroups: 1,
      },
    },
  });

  console.log('[SysCraft] Database seed complete');
}

async function seedDataSources(): Promise<void> {
  const sources = [
    {
      name: 'Red Hat Satellite',
      adapter: 'satellite',
      config: {
        url: 'https://satellite.ailab.local',
        user: 'admin',
        password: 'uwx9UVoUCfVdavna',
      },
      enabled: true,
      syncIntervalMin: 15,
      capabilities: ['hosts', 'packages', 'errata'],
    },
    {
      name: 'Checkmk',
      adapter: 'checkmk',
      config: {
        url: 'http://satellite.ailab.local:8080/cmk/check_mk/api/1.0',
        user: 'grafana',
        password: 'grafana-auto-secret',
      },
      enabled: true,
      syncIntervalMin: 15,
      capabilities: ['monitoring'],
    },
    {
      name: 'DNS Server',
      adapter: 'dns',
      config: {
        server: '127.0.0.1',
        port: 53,
        zone: 'ailab.local',
        batchSize: 20,
        batchDelayMs: 100,
      },
      enabled: false,
      syncIntervalMin: 15,
      capabilities: ['dns'],
    },
    {
      name: 'vCenter Server',
      adapter: 'vcsa',
      config: {
        url: 'https://10.45.138.20',
        user: 'administrator@vsphere.local',
        password: '@@@vasaasDfvBk6@',
      },
      enabled: true,
      syncIntervalMin: 15,
      capabilities: ['vms', 'infrastructure'],
    },
  ];

  for (const src of sources) {
    const existing = await prisma.dataSource.findUnique({ where: { name: src.name } });
    if (!existing) {
      await prisma.dataSource.create({ data: src });
      console.log(`[SysCraft] Created data source: ${src.name}`);
    }
  }
}

async function seedRecommendationSettings(): Promise<void> {
  const recSettings = [
    { key: 'cleanup_threshold_days', value: '7', description: 'Days a host must be unreachable before recommending cleanup from all systems.' },
    { key: 'ping_enabled', value: 'true', description: 'Enable ICMP ping liveness checks during sync.' },
    { key: 'ping_timeout_ms', value: '3000', description: 'Ping timeout in milliseconds per host.' },
    { key: 'ping_batch_size', value: '10', description: 'Number of concurrent pings per batch.' },
    { key: 'vm_powered_off_threshold_days', value: '14', description: 'Days a VM must be powered off before generating a cleanup recommendation.' },
    { key: 'rec_register_satellite', value: 'true', description: 'Recommend registering missing hosts in Satellite.' },
    { key: 'rec_add_checkmk', value: 'true', description: 'Recommend adding missing hosts to Checkmk.' },
    { key: 'rec_cleanup_dead', value: 'true', description: 'Recommend cleanup for unreachable hosts.' },
    { key: 'rec_install_agent', value: 'true', description: 'Recommend installing missing agents.' },
    { key: 'rec_classify_os', value: 'true', description: 'Prompt to classify unknown OS hosts.' },
    { key: 'rec_add_dns', value: 'true', description: 'Recommend creating missing DNS records.' },
    { key: 'rec_fix_dns_reverse', value: 'true', description: 'Recommend fixing missing reverse PTR records.' },
    { key: 'rec_fix_dns_mismatch', value: 'true', description: 'Recommend fixing DNS forward/reverse mismatches.' },
    { key: 'rec_ip_reuse', value: 'true', description: 'Detect IP reuse and MAC address conflicts.' },
    { key: 'rec_vm_powered_off', value: 'true', description: 'Flag VMs that have been powered off.' },
  ];

  for (const setting of recSettings) {
    const existing = await prisma.setting.findUnique({ where: { key: setting.key } });
    if (!existing) {
      await prisma.setting.create({ data: setting });
      console.log(`[SysCraft] Added setting: ${setting.key}`);
    }
  }
}

// Run directly if executed as a script
const isDirectRun = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isDirectRun) {
  seed()
    .then(() => {
      console.log('[SysCraft] Seed script finished');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SysCraft] Seed script failed:', err);
      process.exit(1);
    });
}
