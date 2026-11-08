/**
 * Copy the MediaPipe wasm runtime from node_modules into public/ so the app serves it itself
 * (no third-party CDN). Runs automatically before `dev` and `build`. The copy is git-ignored;
 * its version always matches the installed @mediapipe/tasks-vision package.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
)
const target = fileURLToPath(new URL('../public/mediapipe/wasm/', import.meta.url))

mkdirSync(target, { recursive: true })
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  copyFileSync(source + file, target + file)
}
console.log(`MediaPipe wasm copied to ${target}`)
