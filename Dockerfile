# Multi-stage build for mglaroute-vpn-server

# Stage 1: Backend build
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./
RUN npm run build

# Stage 2: Frontend build
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 3: Backend production
FROM node:18-alpine AS backend-prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package.json ./backend/package.json
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]

# Stage 4: Frontend production (nginx)
FROM nginx:alpine AS frontend-prod
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]