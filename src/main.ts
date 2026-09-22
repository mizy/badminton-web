import { startGame } from './play/start'

const dispose = startGame()
if (import.meta.hot) import.meta.hot.dispose(dispose)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    console.warn('离线缓存未就绪；当前页面仍可游玩。')
  })
}
