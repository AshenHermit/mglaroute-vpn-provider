# Multi-stage build for mglaroute-vpn-server

# Stage 1: shared build (pnpm workspace; npm ci has no package-lock.json here)
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
 && npm install -g pnpm@10.12.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile
COPY backend ./backend
COPY frontend ./frontend
RUN pnpm --filter mglaroute-vpn-server-backend xray:download \
 && pnpm --filter mglaroute-vpn-server-backend build \
 && pnpm --filter mglaroute-vpn-server-frontend build

# Stage 2: Backend production
FROM node:20-alpine AS backend-prod
WORKDIR /app
ENV NODE_ENV=production
# pnpm node_modules use relative symlinks into the workspace root; keep both paths.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/bin ./backend/bin
COPY --from=builder /app/backend/package.json ./backend/package.json
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]

# Stage 3: Frontend production (nginx)
FROM nginx:alpine AS frontend-prod
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
