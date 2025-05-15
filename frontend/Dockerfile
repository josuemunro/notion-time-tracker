# Stage 1: Build the React application
FROM node:18-alpine AS builder
WORKDIR /app/frontend

# Define the build argument that Vite can use
# Default value if not provided by docker-compose build args
ARG VITE_API_BASE_URL=/api
# Make it available to npm run build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package*.json ./
RUN npm install
COPY . .

# During build, Vite will replace import.meta.env.VITE_API_BASE_URL if it uses it.
# Our api.js now hardcodes '/api' for baseURL, but this ENV is good practice.
RUN echo "Building with VITE_API_BASE_URL=${VITE_API_BASE_URL}" && npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Copy static assets from builder stage
COPY --from=builder /app/frontend/dist .

# Copy custom Nginx configuration (optional, but good for SPA routing)
# We'll create nginx.conf next
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

ENTRYPOINT ["nginx", "-g", "daemon off;"]