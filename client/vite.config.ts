import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const certDirectory = path.resolve(root, '../certs')
const keyPath = path.join(certDirectory, 'dev-key.pem')
const certPath = path.join(certDirectory, 'dev-cert.pem')
const https = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/rtc': {
        target: 'http://127.0.0.1:7880',
        ws: true,
        changeOrigin: true,
      },
      '/twirp': {
        target: 'http://127.0.0.1:7880',
        changeOrigin: true,
      },
    },
    fs: {
      allow: [path.resolve(root, '..')],
    },
  },
})
