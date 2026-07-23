# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Stage 2: Backend deps — build tools so sqlite3 can compile from source
# when its prebuilt-binary download fails (Railway builders get rate-limited)
FROM node:18-alpine AS backend-builder
WORKDIR /usr/src/app
# py3-setuptools restores distutils, which sqlite3's old node-gyp needs on Python 3.12+
RUN apk add --no-cache python3 py3-setuptools make g++
COPY backend/package*.json ./
RUN npm install --omit=dev

# Stage 3: Production server
FROM node:18-alpine
WORKDIR /usr/src/app

COPY --from=backend-builder /usr/src/app/node_modules ./node_modules

COPY backend/ .

# Copy built frontend into backend's static serve directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Create data directory for SQLite
RUN mkdir -p /data && chown -R node:node /data && mkdir -p ./assets/icons && chown -R node:node ./assets

USER node

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/notion_time_tracker.sqlite

EXPOSE 3001

CMD ["node", "src/app.js"]
