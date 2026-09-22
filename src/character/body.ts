import type { PlayerState } from './types'

export function beginBodyAction(player: PlayerState, action: 'jump' | 'scissor'): PlayerState {
  if (player.body.phase !== 'grounded' || player.swing.phase === 'recovery') return player
  const cost = action === 'jump' ? 7 : 5
  if (player.stamina < cost) return { ...player, feedback: '体力不足：先回位恢复，再起跳' }
  return {
    ...player, stamina: player.stamina - cost,
    body: { phase: 'loading', action, elapsed: 0, verticalVelocity: 0 },
    feedback: action === 'jump' ? '屈膝起跳 · 腾空后选择击球' : '蹬地转体 · 衔接击球并向前回位',
  }
}

export function advanceBody(player: PlayerState, dt: number): PlayerState {
  if (player.body.phase === 'grounded') return player
  let next = player
  for (let remaining = dt; remaining > 1e-9;) {
    const step = Math.min(remaining, 1 / 240)
    remaining -= step
    let { phase, action, elapsed, verticalVelocity } = next.body
    elapsed += step
    let height = next.pos[1]
    let movement = next.movement
    if (phase === 'loading' && elapsed + 1e-9 >= (action === 'jump' ? 0.1 : 0.075)) {
      phase = 'airborne'
      elapsed = 0
      verticalVelocity = (action === 'jump' ? 3.65 : 2.7) * (0.82 + 0.18 * next.stamina / next.maxStamina)
      if (action === 'scissor') movement = { ...movement, currentVel: { ...movement.currentVel, x: movement.currentVel.x + (next.side === 0 ? 1.6 : -1.6) } }
    } else if (phase === 'airborne') {
      height += verticalVelocity * step - 9.81 * step * step / 2
      verticalVelocity -= 9.81 * step
      if (height <= 0) {
        height = 0
        phase = 'landing'
        elapsed = 0
        verticalVelocity = 0
        movement = { ...movement, readiness: Math.min(movement.readiness, 0.4), footwork: 'recover' }
      }
    } else if (phase === 'landing' && elapsed + 1e-9 >= (action === 'jump' ? 0.24 : 0.18)) {
      phase = 'grounded'
      action = null
      elapsed = 0
    }
    next = { ...next, pos: [next.pos[0], height, next.pos[2]], movement, body: { phase, action, elapsed, verticalVelocity } }
  }
  return next
}
