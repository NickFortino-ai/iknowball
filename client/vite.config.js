import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Emit source maps so production stack traces show real symbol names
  // instead of minified single-letter identifiers. Trades ~10-20% larger
  // dist for actionable error reporting.
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
