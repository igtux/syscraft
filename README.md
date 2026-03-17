# SysCraft

Infrastructure source of truth that unifies Red Hat Satellite, Checkmk, DNS, and future data sources into a single actionable dashboard.

## What It Does

SysCraft continuously syncs host data from multiple infrastructure systems, detects discrepancies, and generates copy-pasteable remediation commands.

- **Extensible data sources** — Pluggable adapter architecture; add Satellite, Checkmk, DNS, vCSA, NetBox, or custom sources via the UI
- **Multi-source inventory** — All sources consolidated into one normalized view
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
| Database | PostgreSQL 13+ |
| Container | Podman / Docker (Alpine-based) |

## Quick Start

### Prerequisites

PostgreSQL database:
```bash
sudo -u postgres psql -c "CREATE USER syscraft WITH PASSWORD 'your-password';"
sudo -u postgres psql -c "CREATE DATABASE syscraft OWNER syscraft;"
```

### Build and Run

```bash
podman build -t syscraft:latest .
podman run -d --name syscraft \
  --network host \
  --cap-add NET_RAW \
  --env-file .env \
  syscraft:latest
```

Or use the deploy script:
```bash
./deploy.sh
```

Default login: `admin` / `syscraft`

## Architecture

```
DataSource (DB registry)
  ├── Red Hat Satellite (adapter: satellite)
  ├── Checkmk (adapter: checkmk)
  ├── DNS Server (adapter: dns)
  └── ... (future: vcsa, netbox, custom)
       ↓
Scheduler (per-source sync intervals)
  └── HostSource (rawData JSONB + normalizedData JSONB)
       ↓
Reconciler (OS-aware, liveness-aware)
  └── Recommendations (stored in DB, with commands)
       ↓
API + Frontend
```

## Configuration

All settings managed through **Settings** in the UI:

| Setting | Default | Description |
|---------|---------|-------------|
| Sync interval | 15 min | How often sources are polled |
| Stale threshold | 72 hours | When hosts are flagged stale |
| Cleanup threshold | 7 days | When dead hosts get cleanup recommendations |
| Ping enabled | true | ICMP liveness checks during sync |

Data sources are managed in **Settings > Data Sources** — enable/disable, test connections, configure per-source.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/sources` | List all data sources |
| `POST /api/sources` | Add a new data source |
| `POST /api/sources/:id/test` | Test source connection |
| `GET /api/recommendations` | Filterable recommendation list |
| `GET /api/recommendations/summary` | Counts by severity/type/system |
| `GET /api/recommendations/commands/:system` | Combined bash script per system |
| `GET /api/hosts` | Paginated host inventory |
| `GET /api/hosts/:fqdn` | Full detail with liveness + recommendations |
| `PUT /api/hosts/:fqdn/os-category` | Manually classify host OS |
| `GET /api/dashboard` | Aggregated overview |

## License

Private — internal use only.
