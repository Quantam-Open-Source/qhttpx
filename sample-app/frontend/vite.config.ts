import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/todos': 'http://localhost:3000',
      '/notes': 'http://localhost:3000',
      '/upload': 'http://localhost:3000',
      '/chat': {
        target: 'ws://localhost:3000',
        ws: true
      },
      '/health': 'http://localhost:3000',
      '/metrics': 'http://localhost:3000',
      '/graphql': 'http://localhost:3000',
      '/stats': 'http://localhost:3000',
    }
  }
})
