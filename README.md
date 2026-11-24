# mglaroute VPN Server

Admin panel + backend for managing VPN server subscriptions.

## Quick Start

### Development
```bash
docker-compose up -d
cd backend && npm install && npm run start:dev
cd frontend && npm install && npm run dev
```

### Production
```bash
cp .env.example .env
# Edit .env with production values
docker-compose -f docker-compose.prod.yml up -d
```

## Architecture

```
backend/          NestJS API
  auth/           First-run admin, login, JWT
  subscriptions/  SubItem CRUD + fetch/parse
  profiles/       ProfileItem parse, server list per sub
  online-services/ OnlineServiceProfile CRUD
  scanner/        Cron: latency, reachability, anycast score
  query/          Filtered/sorted server list API
  feed/           Public raw subscription / JSON server feed
  settings/       Scanner settings singleton
  common/         Redis, postgres, http client, envelope reply

frontend/         Vite + React admin panel
  pages/          Setup, Login, Dashboard, Subscriptions, OnlineServices, Servers

docker-compose.yml        Dev environment
docker-compose.prod.yml   Production environment
```

## Tech Stack
- Backend: NestJS (TypeScript)
- Frontend: Vite + React + Zustand + shadcn/ui + Tailwind
- DB: PostgreSQL + Redis
- Auth: JWT stateless, first-run setup gate