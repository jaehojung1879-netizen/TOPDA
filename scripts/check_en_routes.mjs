#!/usr/bin/env node
// Regression guard for the English renovation journey. It checks generated
// targets on disk rather than relying on a deployment server or redirects.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const start = join(root, 'en');
const files = [];
const walk = (dir) => readdirSync(dir).forEach((name) => {
  const path = join(dir, name);
  statSync(path).isDirectory() ? walk(path) : name.endsWith('.html') && files.push(path);
});
walk(start);

const failures = [];
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (/^(?:#|https?:|mailto:|tel:|javascript:|data:)/i.test(value)) continue;
    const path = value.split(/[?#]/)[0];
    if (!path) continue;
    const target = path.startsWith('/') ? join(root, path) : resolve(dirname(file), path);
    const candidate = path.endsWith('/') ? join(target, 'index.html') : normalize(target);
    if (!existsSync(candidate)) failures.push(`${file.slice(root.length)} -> ${value}`);
  }
}

const hub = readFileSync(join(start, 'interior', 'index.html'), 'utf8');
const requiredInteriorRoutes = [
  'cost', 'flooring', 'wallpaper', 'tile', 'bathroom', 'kitchen', 'windows',
  '../posts/interior-company', '../posts/interior-quote', '../posts/interior-contract',
  '../posts/interior-defect', '../checklists/interior-contract',
];
for (const route of requiredInteriorRoutes) if (!hub.includes(`${route}.html`)) failures.push(`interior hub is missing ${route}.html`);

const guideHubRoutes = {
  'sale.html': [
    'property-tour', 'registry-reading', 'sale-contract-tips',
    'balance-day-settlement', 'tax-roadmap',
  ],
  'moving.html': [
    'moving-company', 'moving-quote', 'moving-types',
    'moving-day-tips', 'storage-moving', 'move-in-admin',
  ],
};
const app = readFileSync(join(root, 'assets', 'app.js'), 'utf8');
for (const [hubName, routes] of Object.entries(guideHubRoutes)) {
  const guideHub = readFileSync(join(start, hubName), 'utf8');
  if (/<article\b[^>]*class=["'][^"']*\btopic-card\b/i.test(guideHub)) {
    failures.push(`${hubName} still contains non-clickable topic cards`);
  }
  for (const route of routes) {
    const href = `posts/${route}.html`;
    if (!guideHub.includes(`href="${href}"`)) failures.push(`${hubName} is missing clickable ${href}`);
    if (!app.includes(`'${href}'`)) failures.push(`app.js English page map is missing ${href}`);
  }
}

if (failures.length) {
  console.error(`English route check failed (${failures.length})\n${failures.join('\n')}`);
  process.exit(1);
}
const guideRouteCount = Object.values(guideHubRoutes).flat().length;
console.log(`English route check passed: ${files.length} pages; ${requiredInteriorRoutes.length} renovation routes; ${guideRouteCount} clickable sale/moving detail routes.`);
