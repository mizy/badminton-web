/** @entry Connect PWA updates; the play owner decides when reloading is safe. */
export function connectAutoUpdate(canReload: () => boolean) {
  let registration: ServiceWorkerRegistration | undefined
  let controlled = !!navigator.serviceWorker?.controller
  let changed = false
  let reloading = false
  const events = new AbortController()
  const { signal } = events

  function apply(): void {
    if (signal.aborted || document.hidden || reloading || !canReload()) return
    if (changed) {
      reloading = true
      window.location.reload()
    } else registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }

  function check(): void {
    apply()
    if (!document.hidden && navigator.onLine && registration) {
      void registration.update().catch(error => console.warn('新版检查暂时失败，将在下次联网时重试。', error))
    }
  }

  function watchInstalling(): void {
    const worker = registration?.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') apply()
    }, { signal })
  }

  let timer: ReturnType<typeof setInterval> | undefined
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // First installation claims the page without requiring a reload.
      changed = controlled
      controlled = true
      apply()
    }, { signal })
    document.addEventListener('visibilitychange', check, { signal })
    window.addEventListener('online', check, { signal })
    timer = setInterval(check, 60_000)
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then(value => {
        if (signal.aborted) return
        registration = value
        registration.addEventListener('updatefound', watchInstalling, { signal })
        watchInstalling()
        check()
      }).catch(error => console.warn('离线缓存未就绪；当前页面仍可游玩。', error))
  }

  return {
    apply,
    dispose: () => {
      events.abort()
      clearInterval(timer)
    },
  }
}
