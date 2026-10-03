import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [{
    name: 'offline-game',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
        'models/anime-player.glb']
      const files = ['index.html', ...Object.keys(bundle).filter(file => !file.endsWith('.map') && file !== 'index.html'), ...publicFiles]
      const hash = createHash('sha256')
      for (const file of files) {
        const output = bundle[file]
        hash.update(file)
        if (output?.type === 'chunk') hash.update(output.code)
        else if (output) hash.update(output.source)
        else hash.update(readFileSync(new URL(file === 'index.html' ? './index.html' : `./public/${file}`, import.meta.url)))
      }
      const version = hash.digest('hex').slice(0, 16)
      this.emitFile({
        type: 'asset', fileName: 'sw.js',
        source: `const CACHE = 'badminton-${version}';
const FILES = ${JSON.stringify(files)};
// Pre-auto-update pages cannot ask a waiting worker to activate or reload.
// Recognize them from their cached entry script before deleting old caches.
async function needsLegacyMigration() {
  // Activation clears predecessors. The oldest cache is the active build;
  // newer caches may belong to updates still waiting on a legacy page.
  const key = (await caches.keys()).find(key => key.startsWith('badminton-') && key !== CACHE);
  if (!key) return false;
  const cache = await caches.open(key);
  const html = await cache.match(new URL('index.html', self.registration.scope));
  const src = html && (await html.text()).match(/<script[^>]+src="([^"]+)"/);
  const script = src && await cache.match(new URL(src[1], self.registration.scope));
  return !!script && !(await script.text()).includes('SKIP_WAITING');
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })));
    if (await needsLegacyMigration()) await self.skipWaiting();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const legacy = await needsLegacyMigration();
    const pages = legacy ? await self.clients.matchAll({ type: 'window' }) : [];
    await Promise.all((await caches.keys()).filter(key => key.startsWith('badminton-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    // One-time migration only. Update-capable pages keep their match-safe policy.
    // Navigation fetches wait for activation, so do not await them here.
    for (const page of pages) void page.navigate(page.url).catch(error => console.warn('旧版页面迁移暂时失败。', error));
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const key = event.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : event.request;
    return await cache.match(key) || fetch(event.request);
  }));
});`,
      })
    },
  }],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
})
