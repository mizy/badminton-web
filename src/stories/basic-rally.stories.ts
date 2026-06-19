import type { Meta, StoryObj } from '@storybook/html'
import type { AIDifficulty } from '../ai/types'
import {
  createBasicRallyOptions,
  createBasicRallyState,
  stepBasicRally,
  type BasicRallyState,
} from '../play/basicRally'
import { createRallyView, disposeRallyView, syncRallyView } from '../render/rallyView'
import { mountScene } from './threeHelper'

interface BasicRallyArgs {
  difficulty: AIDifficulty
  showTrail: boolean
}

const meta: Meta<BasicRallyArgs> = {
  title: 'Play/Basic Rally',
  tags: ['autodocs'],
  argTypes: {
    difficulty: {
      control: 'select',
      options: ['easy', 'medium', 'hard'],
    },
    showTrail: { control: 'boolean' },
  },
  render: (args: BasicRallyArgs) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '680px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'
    container.style.background = '#101625'

    const overlay = createRallyOverlay(container)
    const ctx = mountScene(container)
    const view = createRallyView(ctx.scene)
    const options = createBasicRallyOptions(args.difficulty)
    options.autoServeDelaySeconds = 0.08
    options.pointPauseSeconds = 0.2
    let rally = createBasicRallyState()

    view.trail.setVisible(args.showTrail)
    ctx.camera.position.set(0, 10.5, 8.8)
    ctx.camera.lookAt(0, 1.0, 0)
    syncRallyView(view, rally.game)
    updateRallyOverlay(overlay, rally, args.difficulty)

    ;(window as any).__badminton_rally_ready__ = false

    function step() {
      if (!ctx.animating) return
      requestAnimationFrame(step)

      const result = stepBasicRally(rally, ctx.clock.getDelta(), options)
      rally = result.rally

      if (result.events.served || result.events.restarted) {
        view.trail.reset()
      }

      syncRallyView(view, rally.game)
      updateRallyOverlay(overlay, rally, args.difficulty)

      if (rally.game.shuttle) {
        ;(window as any).__badminton_rally_ready__ = true
      }
    }
    step()

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      disposeRallyView(view)
      originalDispose()
    }

    return container
  },
}

export default meta

type Story = StoryObj<BasicRallyArgs>

export const AiVsAi: Story = {
  name: '基础回合',
  args: {
    difficulty: 'medium',
    showTrail: true,
  },
}

function createRallyOverlay(container: HTMLElement): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:absolute',
    'top:12px',
    'left:12px',
    'z-index:10',
    'color:#f4f7fb',
    'background:rgba(5,10,18,0.72)',
    'border:1px solid rgba(255,255,255,0.14)',
    'border-radius:6px',
    'padding:10px 12px',
    'font:13px/1.45 monospace',
    'white-space:pre',
    'pointer-events:none',
    'user-select:none',
  ].join(';')
  container.appendChild(overlay)
  return overlay
}

function updateRallyOverlay(
  overlay: HTMLDivElement,
  rally: BasicRallyState,
  difficulty: AIDifficulty,
): void {
  const match = rally.game.match
  const points = match ? `${match.points[0]} : ${match.points[1]}` : '0 : 0'
  overlay.textContent = [
    `AI vs AI  ${difficulty}`,
    `phase ${rally.game.phase}`,
    `score ${points}`,
    `serve ${rally.stats.serveCount}`,
    `rally hits ${rally.stats.hitCount || rally.stats.lastRallyHits}`,
  ].join('\n')
}
