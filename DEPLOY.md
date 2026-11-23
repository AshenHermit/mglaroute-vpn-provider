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

## Production Deployment

1. Copy `.env.example` to `.env`
2. Set production values (especially `JWT_SECRET`)
3. Run `docker-compose -f docker-compose.prod.yml up -d`
4. Access frontend at `http://localhost` (or configured port)
5. Complete first-run setup at `/setup`

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│  (React)    │     │  (NestJS)   │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  (cache)    │
                    └─────────────┘
```

## Health Check
- Backend: `GET /api/health`
- Frontend: `GET /` (nginx)