/** SWING_SELECT 的契约：触屏击球盘在蓄力拖动中改选球路，只动本次挥拍，不重开计时。 */
import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { getShotTarget } from '../character/stroke'

function playing() {
  const state = gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)] })
  return gameReducer(state, { type: 'SERVE', playerIndex: 0 })
}

describe('蓄力中改选球路', () => {
  it('把本次挥拍的球路与落点换成手势解析出来的结果', () => {
    let state = playing()
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'NET_DROP', aim: { lateral: 0, depth: 0 } })
    state = gameReducer(state, { type: 'SWING_SELECT', playerIndex: 0, shot: 'SMASH', aim: { lateral: -1, depth: 0 } })
    const player = state.players[0]!
    expect(player.swing.phase).toBe('preparing')
    expect(player.swing.shot).toBe('SMASH')
    expect(player.swing.aim).toEqual({ lateral: -1, depth: 0 })
    expect(player.selectedShot).toBe('SMASH')
    expect(player.aim).toEqual({ lateral: -1, depth: 0 })
  })

  it('不重开蓄力计时：按住时长照旧换算成力量', () => {
    let state = playing()
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'NET_DROP', aim: { lateral: 0, depth: 0 } })
    state = { ...state, players: [{ ...state.players[0]!, swing: { ...state.players[0]!.swing, elapsed: 0.3 } }, state.players[1]] }
    state = gameReducer(state, { type: 'SWING_SELECT', playerIndex: 0, shot: 'DROP', aim: { lateral: 1, depth: 0 } })
    expect(state.players[0]!.swing.elapsed).toBe(0.3)
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
    expect(state.players[0]!.swing.charge01).toBeGreaterThan(0.5)
  })

  it('改选后的球路就是出拍落点，方向按手势镜像到场地上', () => {
    let state = playing()
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'NET_DROP', aim: { lateral: 0, depth: 0 } })
    state = gameReducer(state, { type: 'SWING_SELECT', playerIndex: 0, shot: 'CLEAR', aim: { lateral: 1, depth: 0 } })
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
    const player = state.players[0]!
    // 落点深度按档位加长（高远 5.65m + 蓄力加成），横向按右路推到 +1.85m。
    expect(getShotTarget(player, player.swing.shot, player.swing.aim)[2]).toBeCloseTo(1.85, 6)
    expect(getShotTarget(player, player.swing.shot, player.swing.aim)[0]).toBeGreaterThan(5.6)
  })

  it('没在蓄力时是空操作（不预选、不改落点）', () => {
    const idle = playing()
    const after = gameReducer(idle, { type: 'SWING_SELECT', playerIndex: 0, shot: 'SMASH', aim: { lateral: 1, depth: 0 } })
    expect(after.players[0]!.selectedShot).toBe('CLEAR')
    expect(after.players[0]!.aim).toEqual({ lateral: 0, depth: 0 })
    expect(after.players[0]!.swing.phase).toBe('ready')
  })
})
