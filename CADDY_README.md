# mglaroute-vpn-server — Caddy reverse proxy

Routes:
- `admin.mglaroute.ashen-hermit.space` → frontend
- `api.mglaroute.ashen-hermit.space` → backend

## Requirements
- Docker network named `proxy` (shared with nginx proxy manager)
- DNS A records for `*.mglaroute.ashen-hermit.space` pointing at this container

## Usage
```bash
docker compose -f docker-compose.caddy.yml up -d
```

## Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `COMMON_DOMAIN` | `ashen-hermit.space` | Root domain |
| `PANEL_SUBDOMAIN` | `admin.mglaroute` | Admin panel subdomain |
| `BACKEND_SUBDOMAIN` | `api.mglaroute` | API subdomain |
| `BACKEND_HOST` | `mglaroute-backend` | Backend container name |
| `FRONTEND_HOST` | `mglaroute-frontend` | Frontend container name |
| `BACKEND_PORT` | `3000` | Backend port |
| `FRONTEND_PORT` | `5173` | Frontend port |

## Integration with nginx proxy manager
1. Create a "Proxy Host" in NPM for `admin.mglaroute.ashen-hermit.space` → `http://mglaroute-caddy:80`
2. Create a "Proxy Host" for `api.mglaroute.ashen-hermit.space` → `http://mglaroute-caddy:80`
3. Or, simpler: point DNS A records for `*.mglaroute.ashen-hermit.space` at Caddy's IP and let Caddy handle everything