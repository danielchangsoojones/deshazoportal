import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/notebook-api': {
        target: 'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/notebook-api/, '/api/notebook'),
      },
    },
  },
})
