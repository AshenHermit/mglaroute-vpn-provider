# Deployment Guide

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | PostgreSQL host | localhost |
| DB_PORT | PostgreSQL port | 5432 |
| DB_USER | PostgreSQL user | mglaroute |
| DB_PASSWORD | PostgreSQL password | mglaroute |
| DB_NAME | PostgreSQL database | mglaroute |
| DB_SYNCHRONIZE | Auto-sync schema | true (dev), false (prod) |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| JWT_SECRET | JWT signing secret | (required in prod) |
| PORT | Backend port | 3000 |
| FRONTEND_URL | Frontend URL for CORS | http://localhost:5173 |
| COMMON_DOMAIN | Root domain | ashen-hermit.space |
| PANEL_SUBDOMAIN | Admin panel subdomain | admin.mglaroute |
| BACKEND_SUBDOMAIN | API subdomain | api.mglaroute |
| CADDY_PORT | Port for external proxy to connect to Caddy | 8080 |

## Production Deployment

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Root Nginx Proxy Manager               │
│  (TLS termination, rate limiting, firewall)         │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
       ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│  Caddy           │   │  Other services  │
│  (port 8080)     │   │  (VPN server,    │
│                  │   │   etc.)          │
└──┬───────────┬────┘   └──────────────────┘
   │   │   │
   ▼   ▼   ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│ Frontend│ │ Backend  │ │PostgreSQL│
│ (React) │ │ (NestJS) │ │          │
└─────────┘ └────┬─────┘ └──────────┘
                  │
                  ▼
            ┌──────────┐
            │  Redis   │
            │ (cache)  │
            └──────────┘
```

### Subdomain Routing

| Subdomain | Service | Purpose |
|-----------|---------|---------|
| `admin.mglaroute.ashen-hermit.space` | Frontend container | Admin panel UI |
| `api.mglaroute.ashen-hermit.space` | Backend container | REST API |

### Root Proxy Setup (Nginx Proxy Manager)

Create two proxy hosts pointing to Caddy on port ${CADDY_PORT:-8080}:

1. **Admin Panel**
   - Domain: `admin.mglaroute.ashen-hermit.space`
   - Forward: `http://127.0.0.1:${CADDY_PORT:-8080}` (Caddy)
   - Scheme: `http`
   - Block WebSockets: `yes`

2. **API**
   - Domain: `api.mglaroute.ashen-hermit.space`
   - Forward: `http://127.0.0.1:${CADDY_PORT:-8080}` (Caddy)
   - Scheme: `http`
   - Block WebSockets: `yes`

Caddy handles internal routing based on Host header. No TLS at Caddy level — root proxy terminates TLS.

### Deploy Steps

1. Copy `.env.example` to `.env`
2. Set production values (especially `JWT_SECRET`, `FRONTEND_URL`)
3. Run `docker-compose -f docker-compose.prod.yml up -d`
4. Complete first-run setup at `https://admin.mglaroute.ashen-hermit.space/setup`

### CORS

The admin panel (`admin.*`) and API (`api.*`) live on different subdomains, so the
browser enforces CORS. NestJS (`backend/src/main.ts`) handles it with
`app.enableCors()` using `FRONTEND_URL`. Caddy is only a reverse proxy — do not
add `Access-Control-*` there. Caddy's `respond` directive cannot set those
headers, and a second CORS layer duplicates `Access-Control-Allow-Origin`, which
browsers reject.

`FRONTEND_URL` must be the exact panel origin, e.g.
`https://admin.mglaroute.ashen-hermit.space`. Verify after deploy:

```bash
curl -sI -X OPTIONS \
  -H "Origin: https://admin.mglaroute.ashen-hermit.space" \
  -H "Access-Control-Request-Method: POST" \
  https://api.mglaroute.ashen-hermit.space/api/auth/first-run
```

### Health Check
- Backend: `GET https://api.mglaroute.ashen-hermit.space/api/health`
- Frontend: `GET https://admin.mglaroute.ashen-hermit.space/`