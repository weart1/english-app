// Renders every PNG icon from the single source SVG (scripts/icon.svg) using the
// Playwright Chromium that is already a dev dependency — no image library needed.
// Usage: npm run icons
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** Full-bleed variant (no rounding, no transparency) for apple-touch-icon and maskable. */
function squareSvg(scale) {
  const offset = (512 - 512 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs><linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4A82FF"/><stop offset="1" stop-color="#1F56E0"/></linearGradient></defs>
    <rect width="512" height="512" fill="url(#bg2)"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${inner.replace(/<rect[^>]*\/>/, '')}</g>
  </svg>`;
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, svg: src, transparent: true },
  { file: 'public/icons/icon-512.png', size: 512, svg: src, transparent: true },
  // Maskable: content must sit inside the central 80% safe zone.
  { file: 'public/icons/icon-512-maskable.png', size: 512, svg: squareSvg(0.72), transparent: false },
  // iOS applies its own rounding; the icon must be opaque.
  { file: 'public/apple-touch-icon-180.png', size: 180, svg: squareSvg(0.9), transparent: false },
];

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', src);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.transparent ? 'transparent' : '#1F56E0'}">` +
      `<div style="width:${t.size}px;height:${t.size}px">${t.svg.replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`)}</div></body></html>`,
  );
  const buf = await page.screenshot({ omitBackground: t.transparent, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  writeFileSync(t.file, buf);
  process.stdout.write(`wrote ${t.file}\n`);
}
await browser.close();
