// Planche de contact des illustrations d'une saison, sur fond clair ET sombre, puis capture.
// Usage (depuis la racine du front) : node .claude/skills/repas-designer/scripts/sheet.mjs src/design/season/art/halloween /tmp/planche
// Écrit /tmp/planche.html et /tmp/planche.png : lire l'image, corriger ce qui est laid ou invisible sur un des fonds.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [dir, out] = process.argv.slice(2)
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
const width = (f) => (/witch|scene|manor|village/.test(f) ? 420 : 150)
const cell = (f, bg, ink) =>
  `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:6px"><div style="background:${bg};border-radius:16px;padding:14px;width:${width(f)}px;color:${ink}">${readFileSync(`${dir}/${f}`, 'utf8').replace('<svg ', '<svg style="width:100%;height:auto;display:block" ')}</div><figcaption style="font:12px sans-serif;color:#888">${f}</figcaption></figure>`
const row = (bg, ink, page) =>
  `<div style="display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:${page}">${files.map((f) => cell(f, bg, ink)).join('')}</div>`

writeFileSync(`${out}.html`, `<!doctype html><meta charset=utf-8><body style="margin:0">${row('#f7f2ea', '#1d1530', '#e8e2d8')}${row('#110b1b', '#efe9f7', '#0a0612')}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 })
await page.goto(`file://${resolve(`${out}.html`)}`)
await page.screenshot({ path: `${out}.png`, fullPage: true })
await browser.close()
