# SysCraft

Infrastructure source of truth that unifies Red Hat Satellite, Checkmk, and DNS into a single actionable dashboard.

## What It Does

SysCraft continuously syncs host data from multiple infrastructure systems, detects discrepancies, and generates copy-pasteable remediation commands.

- **Multi-source inventory** — Satellite, Checkmk, DNS consolidated into one view
- **Liveness detection** — ICMP ping + Checkmk status + Satellite checkin signals
- **OS-aware recommendations** — Linux hosts get Satellite + Checkmk checks; Windows/appliances get Checkmk only
- **Command generation** — `hammer` and `curl` commands ready to paste, grouped per host or per system
- **Agent compliance** — Tracks required agents (subscription-manager, check-mk-agent, etc.) with baseline scoring
- **Dead host cleanup** — Recommends removal after configurable unreachable threshold

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express, Prisma ORM |
| Database | SQLite |
| Container | Podman / Docker (Alpine-based) |

## Quick Start

```bash
# Build and run
podman build -t syscraft:latest .
podman run -d --name syscraft \
  --network host \
  --cap-add NET_RAW \
  -v /opt/syscraft/data:/app/data:Z \
  --env-file .env \
  syscraft:latest
```

Or use the deploy script:

```bash
./deploy.sh
```

Default login: `admin` / `syscraft`

## Configuration

All settings are managed through the UI at **Settings**:

| Setting | Default | Description |
|---------|---------|-------------|
| Sync interval | 15 min | How often sources are polled |
| Stale threshold | 72 hours | When hosts are flagged stale |
| Cleanup threshold | 7 days | When dead hosts get cleanup recommendations |
| Ping enabled | true | ICMP liveness checks during sync |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/recommendations` | Filterable recommendation list |
| `GET /api/recommendations/summary` | Counts by severity/type/system |
| `GET /api/recommendations/commands/:system` | Combined bash script per system |
| `GET /api/hosts` | Paginated host inventory |
| `GET /api/hosts/:fqdn` | Full detail with liveness + recommendations |
| `GET /api/dashboard` | Aggregated overview |

## License

Private — internal use only.
