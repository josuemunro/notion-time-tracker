# Stage 1: Build the React application
FROM node:18-alpine AS builder
WORKDIR /app/frontend

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
# The REACT_APP_API_BASE_URL will be used by the app to know where the backend is.
# For Docker Compose, this can be http://backend:BACKEND_PORT
# For local dev (npm run dev), Vite proxy handles this.
ARG REACT_APP_API_BASE_URL=/api 
# Ensure your app uses this env var (e.g., process.env.REACT_APP_API_BASE_URL or import.meta.env.VITE_API_BASE_URL for Vite)
# For Vite, environment variables prefixed with VITE_ are exposed to the client-side code.
# So, we'll use VITE_API_BASE_URL. The build command will pass this.
ENV VITE_API_BASE_URL=${REACT_APP_API_BASE_URL}
RUN npm run build

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