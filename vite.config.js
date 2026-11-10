
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep the heat plugin separate so it loads after Leaflet.
            if (id.includes('leaflet.heat')) {
              return 'vendor-leaflet-heat'
            }

            if (id.includes('leaflet')) {
              return 'vendor-leaflet'
            }

            if (id.includes('firebase')) {
              return 'vendor-firebase'
            }

            if (id.includes('framer-motion')) {
              return 'vendor-motion'
            }

            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }

            if (
              id.includes('@radix-ui') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'vendor-ui'
            }
          }
        },
      },
    },
  },
})
