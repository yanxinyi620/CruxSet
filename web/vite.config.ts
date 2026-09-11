import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite'
import { labApiPrefix, segmentationLabAssets } from './segmentation-lab-assets.js'

const root = fileURLToPath(new URL('.', import.meta.url))
export function webConfig({ command, mode, isPreview }: ConfigEnv): UserConfig {
  const local = mode === 'local-web' || (command === 'serve' && !isPreview)
  const proxy = {
    [labApiPrefix]: { target: 'http://127.0.0.1:8000', changeOrigin: false },
    '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
  }
  return {
    plugins: [segmentationLabAssets(local)], root, publicDir: resolve(root, 'public'),
    define: { __LOCAL_LAB__: JSON.stringify(local) },
    server: { port: 5173, strictPort: true, host: '0.0.0.0', proxy },
    preview: { host: '127.0.0.1', proxy: local ? proxy : undefined },
    build: { outDir: resolve(root, mode === 'local-web' ? 'dist-local' : 'dist'), emptyOutDir: true },
  }
}
export default defineConfig(webConfig)
