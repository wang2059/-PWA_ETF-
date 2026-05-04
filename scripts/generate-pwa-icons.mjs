#!/usr/bin/env node
/**
 * 由 public/pwa-icon.svg 產生 iOS / Android 需要的 PNG（Safari 不接受 SVG 當 apple-touch-icon）
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(process.cwd(), 'public')
const svgPath = resolve(root, 'pwa-icon.svg')
const svg = readFileSync(svgPath)

const tasks = [
  ['apple-touch-icon.png', 180],
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
]

for (const [name, size] of tasks) {
  const out = resolve(root, name)
  await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  console.log(`[icons] ${name} (${size}×${size})`)
}
