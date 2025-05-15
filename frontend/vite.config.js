import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000, // Your frontend dev port
    proxy: {
      '/api': { // Requests from frontend to /api/...
        target: 'http://localhost:3001', // Will be proxied to backend on port 3001
        changeOrigin: true,
        secure: false, // Good for localhost targets
        // No rewrite needed if backend also expects /api (which ours does)
        configure: (proxy, _options) => { // Optional: for debugging proxy
          proxy.on('error', (err, _req, _res) => { console.log('Proxy error:', err); });
          proxy.on('proxyReq', (proxyReq, req, _res) => { console.log('Proxying request:', req.method, req.originalUrl, 'to', proxyReq.host + proxyReq.path); });
          proxy.on('proxyRes', (proxyRes, req, _res) => { console.log('Received response from proxied request:', proxyRes.statusCode, req.originalUrl); });
        },
      },
    },
  },
})