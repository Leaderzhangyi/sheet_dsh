import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCE = path.join(process.cwd(), 'assets/data-query-icon/data-query-icon.png')
const OUT_DIR = path.join(process.cwd(), 'public/icons')

const TARGETS = [
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 512, name: 'icon-512x512.png' },
]

async function main() {
  const base64 = readFileSync(SOURCE).toString('base64')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('about:blank')

  const results = await page.evaluate(async ({ base64, targets }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const outputs = []
    for (const target of targets) {
      const canvas = document.createElement('canvas')
      canvas.width = target.size
      canvas.height = target.size
      const ctx = canvas.getContext('2d')
      // 高质量缩放：大图先降一半再缩到目标，减少直接大跨度缩放的锯齿
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, target.size, target.size)
      outputs.push({ name: target.name, size: target.size, dataUrl: canvas.toDataURL('image/png') })
    }
    return outputs
  }, { base64, targets: TARGETS })

  mkdirSync(OUT_DIR, { recursive: true })
  for (const output of results) {
    const filePath = path.join(OUT_DIR, output.name)
    writeFileSync(filePath, Buffer.from(output.dataUrl.split(',')[1], 'base64'))
    console.log(`${output.name} (${output.size}x${output.size}) written`)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
