import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const labStatic = resolve(root, '../tools/segmentation-lab/static')
const labOutput = resolve(root, 'dist/segmentation-lab')

const cloudLabConfig = `window.SEGMENTATION_LAB_CONFIG = {
  mode: "cloud",
  apiBase: "/api/v1/segmentation-lab",
  homePath: "/",
  labPath: "/segmentation-lab/",
  loginPath: "/me",
  models: ["sam2", "sam2_tiled"],
  publishTargets: ["cloudflare"],
};\n`

const segmentationLabAssets = () => ({
  name: 'segmentation-lab-assets',
  closeBundle() {
    cpSync(labStatic, labOutput, { recursive: true })
    for (const page of ['index.html', 'results.html', 'calibration.html']) {
      const path = resolve(labOutput, page)
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll('src="/runtime-config.js"', 'src="/segmentation-lab/runtime-config.js"').replaceAll('src="/runtime.js"', 'src="/segmentation-lab/runtime.js"'))
    }
    writeFileSync(resolve(labOutput, 'runtime-config.js'), cloudLabConfig)
  },
})

export default defineConfig({ plugins: [segmentationLabAssets()], root, publicDir: resolve(root, 'public'), server: { port: 5173, strictPort: true, host: '0.0.0.0', proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } }, build: { outDir: resolve(root, 'dist'), emptyOutDir: true } })
