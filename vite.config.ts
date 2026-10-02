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
        'models/quaternius-player.glb', 'models/quaternius-player.png']
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
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('badminton-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
