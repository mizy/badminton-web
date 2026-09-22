import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [{
    name: 'offline-game',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['index.html', ...Object.keys(bundle).filter(file => !file.endsWith('.map') && file !== 'index.html')]
      const version = files.join('|').split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0).toString(16)
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
