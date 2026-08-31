import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({ root, publicDir: resolve(root, 'public'), server: { port: 5173, strictPort: true, host: '0.0.0.0', proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } }, build: { outDir: resolve(root, 'dist'), emptyOutDir: true } })
