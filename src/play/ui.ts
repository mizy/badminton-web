import type { GameState, PointReason } from '../game/types'
import type { BodyState, Footwork } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import { RACKETS, SHOT_NAMES, SHOT_ORDER } from '../character/stroke'
import { PERSONAS, getPersona, type PersonaId } from '../ai/personas'
import { getLegalShots } from '../ai/tactical'
import './ui.css'
import './touchControls.css'

export interface SessionOptions {
  mode: 'training' | 'match'
  persona: PersonaId
  difficulty: 'easy' | 'medium' | 'hard'
  style: 'attacker' | 'rally' | 'placement'
  loadout: 'balanced' | 'power' | 'control'
}

interface PlayCallbacks {
  start: (options: SessionOptions) => void
  pause: () => void
  restart: () => void
  nextSet: () => void
  menu: () => void
  record: () => void
  sound: (enabled: boolean) => void
  prediction: (enabled: boolean) => void
}

const FOOTWORK: Record<Footwork, string> = {
  ready: '准备', start: '启动', chasse: '并步', cross: '交叉步',
  lunge: '跨步', retreat: '后退', recover: '回位',
}
const BODY_PHASE: Record<BodyState['phase'], string> = {
  grounded: '站稳', loading: '蓄力', airborne: '腾空', landing: '落地恢复',
}
const BODY_ACTION: Record<NonNullable<BodyState['action']>, string> = { jump: '起跳', scissor: '蹬转' }
const SHOT_CONTROLS: Record<ShotType, { key: string; condition: string }> = {
  CLEAR: { key: 'J', condition: '身前高点' },
  DROP: { key: 'K', condition: '身前高点' },
  SMASH: { key: 'L', condition: '头顶高点' },
  DRIVE: { key: 'U', condition: '胸肩高度' },
  NET_DROP: { key: 'I', condition: '网前低球' },
  LIFT: { key: 'O', condition: '低手来球' },
}
const POINT_REASON: Record<PointReason, string> = {
  in: '球落界内', out: '击球出界', net: '触网失分', service: '发球违例',
}
const DIFFICULTY_NOTES: Record<SessionOptions['difficulty'], string> = {
  easy: '入门节奏，先找到移动与挥拍的时机。',
  medium: '常规对抗，在回球稳定与主动进攻之间取舍。',
  hard: '更紧凑的对抗，提前判断来球并及时回位。',
}
const STYLE_NOTES: Record<SessionOptions['style'], string> = {
  attacker: '进攻型 · 寻找高点击球，压缩你的回球时间。',
  rally: '相持型 · 用连续回球和深度考验你的耐心。',
  placement: '落点型 · 调动前后场，让每一步都有目的。',
}
const LOADOUT_NOTES: Record<SessionOptions['loadout'], string> = {
  balanced: '均衡拍：出球、准备与回拍折中，适合熟悉全套球路。',
  power: '头重拍：出球更有力，但引拍与回拍更慢，甜区更小。',
  control: '轻快拍：准备与回拍更快，甜区更宽容，但出球力量较低。',
}

type DialogKind = 'menu' | 'paused' | 'set_end' | 'match_end' | null

export interface PlayUIOptions {
  /** 触屏设备：挂载虚拟摇杆 / 击球按钮，并把键盘提示替换为触屏说明。 */
  touch?: boolean
}

/** Owns DOM only. Session changes, audio, prediction and recording belong to the caller. */
export function createPlayUI(callbacks: PlayCallbacks, options: PlayUIOptions = {}): {
  update(state: GameState): void
  showMenu(): void
  setRecording(recording: boolean): void
  /** 触屏操作层的容器；桌面设备下同样存在但隐藏，供键盘路径忽略。 */
  touchRoot: HTMLElement
  destroy(): void
} {
  const touch = options.touch === true
  const root = document.createElement('div')
  root.id = 'play-ui'
  root.className = 'play-ui'
  if (touch) root.dataset.input = 'touch'
  root.innerHTML = `
    <div class="play-hud" data-ui="hud" hidden>
      <div class="play-court-brand" aria-hidden="true"><b>COURT / 01</b><span>单人 · 离线 · 羽毛球</span></div>
      <header class="play-scoreboard" aria-label="比赛记分牌">
        <div class="play-eyebrow" data-ui="mode-label">单打比赛</div>
        <div id="score-overlay" class="play-score"><span>你 <strong data-ui="home-score">0</strong></span><i aria-hidden="true">:</i><span><strong data-ui="away-score">0</strong> <span data-ui="away-name">对手</span></span></div>
        <div id="set-overlay" class="play-set-score">局比分 0 : 0 · 第 1 局</div>
        <div class="play-score-meta"><span data-ui="server">你发球 · 右区</span><span id="rally-overlay">本回合 0 拍</span></div>
      </header>
      <nav class="play-tools" aria-label="比赛工具">
        <button type="button" data-ui="pause" title="暂停比赛（Esc）">暂停 <small>Esc</small></button>
        <button type="button" data-ui="menu">菜单</button>
        <button type="button" data-ui="sound" aria-pressed="true">声音 开</button>
        <button type="button" data-ui="prediction" aria-pressed="false" disabled title="仅训练模式可用">预测 关</button>
        <button type="button" data-ui="record" aria-pressed="false" title="手动开始或停止录像">开始录像</button>
      </nav>
      <aside class="play-training" data-ui="training" aria-labelledby="play-training-title" hidden>
        <div class="play-eyebrow">PRACTICE / 05</div>
        <h2 id="play-training-title">把基本功连起来</h2>
        <ol class="play-tasks">
          <li data-task="0"><span class="play-task-index">01</span><span><kbd data-ui="move-key">WASD</kbd> 移动</span><span class="play-task-state">待完成</span></li>
          <li data-task="1"><span class="play-task-index">02</span><span><kbd data-ui="serve-key">Space</kbd> 发球</span><span class="play-task-state">待完成</span></li>
          <li data-task="2"><span class="play-task-index">03</span><span>任意击球键接一拍</span><span class="play-task-state">待完成</span></li>
          <li data-task="3"><span class="play-task-index">04</span><span>连续多拍 ≥ 6</span><span class="play-task-state">待完成</span></li>
          <li data-task="4"><span class="play-task-index">05</span><span>打出 6 种球路</span><span class="play-task-state">待完成</span></li>
        </ol>
        <p data-ui="training-summary">最长 0 拍 · 球路 0 / 6</p>
        <p class="play-training-note">先到位再起跳，高点按击球键。空中不能二次起跳，落地要恢复。预测标记仅作落点参考。</p>
      </aside>
      <footer class="play-console">
        <div id="status" class="play-feedback" role="status" aria-live="polite" aria-atomic="true"><strong data-ui="status-title">准备上场</strong><span data-ui="feedback">提前到位，留出引拍时间。</span></div>
        <div class="play-player-readout">
          <div class="play-stamina"><label for="play-stamina">体力 <span data-ui="stamina-value">100%</span></label><progress id="play-stamina" max="100" value="100">100%</progress></div>
          <div class="play-technique"><span data-ui="footwork">步法 · 准备</span><span data-ui="grip">握拍 · 正手</span><span data-ui="body">身体 · 站稳</span><span data-ui="aim">落点 · 中路 / 标准深度</span></div>
        </div>
        <ol class="play-shots" data-ui="shots" aria-label="J K L U I O 直接击球；数字 1 至 6 同效；等待发球时仅选球"></ol>
        <div class="play-contact-window" data-ui="contact-window" hidden><strong>当前可打窗口</strong><span data-ui="legal-shots">等待发球</span><small>仅提示身体可达，仍需提前引拍；不保证命中。</small></div>
        <div class="play-key-hints" aria-label="键盘操作">
          <span><kbd>W A S D</kbd> 移动</span><span><kbd>J K I L</kbd> 直接发球</span><span><kbd>Space</kbd> 起跳</span><span><kbd>Q</kbd> 蹬转</span><span>击球按住蓄力 · <kbd>WASD</kbd> 定方向 · 松开出拍</span><span><kbd>Esc</kbd> 暂停</span>
          <span><kbd>Space</kbd> → <kbd>L</kbd> 跳杀</span><span><kbd>Q</kbd> → <kbd>L</kbd> 蹬转杀</span><span><kbd>Shift + J</kbd> 滑板高远</span><span><kbd>Shift + K</kbd> 切削吊球</span>
        </div>
        <p class="play-touch-hint">左摇杆移动 · 按住球路蓄力 · 按住时拖动瞄准 · 松开出拍 · 右下角发球 / 起跳 / 蹬转 / 暂停</p>
      </footer>
      <p class="play-mobile-hint">小窗口建议横屏或全屏游玩；键盘操作不受影响。</p>
      <div class="play-touch" data-ui="touch" aria-label="触屏操作">
        <div class="play-touch-stick" data-touch="stick" role="group" aria-label="移动摇杆">
          <span class="play-touch-stick-ring" aria-hidden="true"></span>
          <i class="play-touch-stick-knob" data-touch="stick-knob" aria-hidden="true"></i>
        </div>
        <div class="play-touch-actions" aria-label="功能按钮">
          <button type="button" class="play-touch-button" data-touch="action" data-action="serve">发球<small>起跳</small></button>
          <button type="button" class="play-touch-button" data-touch="action" data-action="scissor">蹬转</button>
          <button type="button" class="play-touch-button" data-touch="action" data-action="pause">暂停</button>
        </div>
        <div class="play-touch-shots" data-ui="touch-shots" aria-label="按住蓄力、拖动瞄准、松开出拍"></div>
      </div>
    </div>
    <div class="play-modal-layer" data-ui="layer">
      <section class="play-menu" data-ui="menu-dialog" role="dialog" aria-modal="true" aria-labelledby="play-menu-title" aria-describedby="play-menu-description" tabindex="-1">
        <header class="play-menu-masthead"><span>COURT / 01</span><span>羽毛球单打实验场</span><span>OFFLINE EDITION</span></header>
        <div class="play-menu-grid">
          <div class="play-editorial">
            <p class="play-eyebrow">LESS NOISE. MORE RALLIES.</p>
            <h1 id="play-menu-title">把每一拍，<br>打到实处<span>。</span></h1>
            <p id="play-menu-description" class="play-lead">从第一拍到决胜分。用站位、节奏与落点，<br class="play-desktop-break">打出属于你的单打。</p>
            <div class="play-court-sketch" aria-hidden="true"><span></span><i></i><b>01</b></div>
            <div class="play-editorial-note"><span>纯单机 / 无需联网</span><p>没有数值升级。练习到位，读懂来球，<br>再把下一拍打得更好。</p></div>
          </div>
          <div class="play-setup">
            <div class="play-section-heading"><h2>设定你的球局</h2><span>SESSION SETUP</span></div>
            <div class="play-select-row">
              <div class="play-field"><label for="play-difficulty">01 / 对手难度</label><select id="play-difficulty" aria-describedby="play-difficulty-note"><option value="easy">入门 · EASY</option><option value="medium" selected>标准 · MEDIUM</option><option value="hard">挑战 · HARD</option></select></div>
              <div class="play-field"><label for="play-style">02 / 陪练与对手风格</label><select id="play-style" aria-describedby="play-style-note"><option value="attacker">进攻型</option><option value="rally" selected>相持型</option><option value="placement">落点型</option></select></div>
            </div>
            <div class="play-option-notes"><p id="play-difficulty-note"></p><p id="play-style-note"></p></div>
            <div class="play-field"><label for="play-persona">04 / 对手球手</label><select id="play-persona" aria-describedby="play-persona-note"></select></div>
            <div class="play-persona-note"><p id="play-persona-note"></p></div>
            <div class="play-field"><label for="play-persona">04 / 对手球手</label><select id="play-persona" aria-describedby="play-persona-note"></select></div>
            <div class="play-persona-note"><p id="play-persona-note"></p></div>
            <div class="play-field"><label for="play-loadout">03 / 球拍配置</label><select id="play-loadout" aria-describedby="play-loadout-note play-equipment-disclaimer"><option value="balanced">均衡拍 / BALANCED</option><option value="power">头重拍 / POWER</option><option value="control">轻快拍 / CONTROL</option></select></div>
            <div class="play-equipment-note"><p id="play-loadout-note"></p><span data-ui="racket-spec"></span><p id="play-equipment-disclaimer">三种配置各有取舍，并非强弱等级。参数为简化模拟，不是精密器材标定。</p></div>
            <div class="play-mode-actions">
              <button type="button" class="play-mode-button play-button-primary" data-ui="start-training"><span>自由训练 <b aria-hidden="true">↗</b></span><small>无比分压力 · 五步练习 · 落点预测</small></button>
              <button type="button" class="play-mode-button play-button-paper" data-ui="start-match"><span>人机比赛 <b aria-hidden="true">↗</b></span><small>三局两胜 · 21 分制 · 决胜到最后一拍</small></button>
            </div>
          </div>
        </div>
        <footer class="play-menu-footer">
          <div class="play-menu-controls" data-ui="keyboard-controls"><span><kbd>WASD</kbd> 移动 <kbd>Space</kbd> 起跳 <kbd>Q</kbd> 蹬转</span><span>发球 <kbd>J</kbd> 高远 <kbd>K</kbd> 小球 <kbd>I</kbd> 反手小 <kbd>L</kbd> 平射（按下即发）· 击球 <kbd>J</kbd> 高远 <kbd>K</kbd> 吊球 <kbd>L</kbd> 杀球 <kbd>U</kbd> 平抽 <kbd>I</kbd> 放网 <kbd>O</kbd> 挑球</span><span>击球按住蓄力、<kbd>WASD</kbd> 定落点 · <kbd>Space → L</kbd> 跳杀 <kbd>Q → L</kbd> 蹬转杀 <kbd>Shift + J</kbd> 滑板高远 <kbd>Shift + K</kbd> 切削吊球</span></div>
          <p class="play-keyboard-note">球路键按下即击球，数字 1–6 同效；等待发球时仅选球。Shift 单独不挥拍。</p>
          <p class="play-keyboard-note">先到位再起跳，空中不能二次起跳，落地要恢复。推荐桌面 + 键盘 · 支持 Tab / Enter 操作菜单</p>
          <div class="play-touch-controls" data-ui="touch-controls">
            <span>左摇杆移动（推到底冲刺）</span><span>右下 6 个球路按钮：按住蓄力，松开出拍</span><span>按住球路时在按钮或摇杆上拖动 = 调整落点</span><span>右下角另有 发球 / 起跳、蹬转、暂停</span><span>等待发球时按住球路按钮即可直接发球</span><span>先到位再起跳，空中不能二次起跳</span>
          </div>
        </footer>
      </section>
      <section class="play-break-dialog" data-ui="break-dialog" role="dialog" aria-modal="true" aria-labelledby="play-break-title" aria-describedby="play-break-description" tabindex="-1" hidden>
        <p class="play-eyebrow" data-ui="break-eyebrow">TAKE A BREATH</p>
        <h2 id="play-break-title">暂停一下</h2>
        <p id="play-break-description">比赛已暂停，准备好后继续。</p>
        <div class="play-result-score" data-ui="result-score"></div>
        <table class="play-results" data-ui="results"><caption>本场实际局分</caption><thead><tr><th scope="col">局次</th><th scope="col">你</th><th scope="col">对手</th></tr></thead><tbody data-ui="result-rows"></tbody></table>
        <p class="play-result-point" data-ui="result-point"></p>
        <div class="play-dialog-actions"><button type="button" class="play-button-primary" data-ui="resume">继续比赛 <small>Esc</small></button><button type="button" class="play-button-primary" data-ui="next-set" hidden>开始下一局</button><button type="button" class="play-button-paper" data-ui="restart">重新开始</button><button type="button" class="play-button-quiet" data-ui="return-menu">返回菜单</button></div>
        <p class="play-dialog-note" data-ui="dialog-note">重新开始将清空本场进度。</p>
      </section>
    </div>`
  document.body.append(root)

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = root.querySelector<T>(selector)
    if (!node) throw new Error(`Missing play UI element: ${selector}`)
    return node
  }
  const ui = <T extends HTMLElement = HTMLElement>(name: string) => element<T>(`[data-ui="${name}"]`)
  const hud = ui('hud')
  const layer = ui('layer')
  const menuDialog = ui('menu-dialog')
  const breakDialog = ui('break-dialog')
  const difficulty = element<HTMLSelectElement>('#play-difficulty')
  const style = element<HTMLSelectElement>('#play-style')
  const loadout = element<HTMLSelectElement>('#play-loadout')
  const personaSelect = element<HTMLSelectElement>('#play-persona')
  for (const persona of PERSONAS) {
    const option = document.createElement('option')
    option.value = persona.id
    option.textContent = `${persona.name} · ${persona.tagline}`
    personaSelect.append(option)
  }
  const awayName = ui('away-name')
  const homeScore = ui('home-score')
  const awayScore = ui('away-score')
  const setScore = element('#set-overlay')
  const rally = element('#rally-overlay')
  const modeLabel = ui('mode-label')
  const server = ui('server')
  const trainingPanel = ui('training')
  const trainingSummary = ui('training-summary')
  const contactWindow = ui('contact-window')
  const legalShotsText = ui('legal-shots')
  const statusTitle = ui('status-title')
  const feedback = ui('feedback')
  const footwork = ui('footwork')
  const grip = ui('grip')
  const body = ui('body')
  const aim = ui('aim')
  const stamina = element<HTMLProgressElement>('#play-stamina')
  const staminaValue = ui('stamina-value')
  const pauseButton = ui<HTMLButtonElement>('pause')
  const soundButton = ui<HTMLButtonElement>('sound')
  const predictionButton = ui<HTMLButtonElement>('prediction')
  const recordButton = ui<HTMLButtonElement>('record')
  const resumeButton = ui<HTMLButtonElement>('resume')
  const nextSetButton = ui<HTMLButtonElement>('next-set')
  const restartButton = ui<HTMLButtonElement>('restart')
  const breakTitle = element('#play-break-title')
  const breakDescription = element('#play-break-description')
  const breakEyebrow = ui('break-eyebrow')
  const resultScore = ui('result-score')
  const resultTable = ui('results')
  const resultPoint = ui('result-point')
  const dialogNote = ui('dialog-note')
  const taskRows = Array.from(root.querySelectorAll<HTMLElement>('[data-task]'))
  const taskLabels = taskRows.map(row => row.querySelector<HTMLElement>('.play-task-state')!)
  const shotItems = SHOT_ORDER.map((shot, index) => {
    const item = document.createElement('li')
    const control = SHOT_CONTROLS[shot]
    const key = document.createElement('kbd')
    key.textContent = control.key
    const name = document.createElement('span')
    name.textContent = SHOT_NAMES[shot]
    const condition = document.createElement('small')
    condition.textContent = control.condition
    item.append(key, name, condition)
    item.title = `${control.key} / ${index + 1} 直接${SHOT_NAMES[shot]} · ${control.condition}且球在身前可达；等待发球时仅选球`
    item.dataset.shot = shot
    ui('shots').append(item)
    return item
  })
  const touchShotButtons = SHOT_ORDER.map(shot => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'play-touch-shot'
    button.dataset.touch = 'shot'
    button.dataset.shot = shot
    const name = document.createElement('span')
    name.textContent = SHOT_NAMES[shot]
    const condition = document.createElement('small')
    condition.textContent = SHOT_CONTROLS[shot].condition
    button.append(name, condition)
    button.title = `按住${SHOT_NAMES[shot]}蓄力（${SHOT_CONTROLS[shot].condition}），拖动瞄准，松开出拍；等待发球时直接发出`
    ui('touch-shots').append(button)
    return button
  })
  const resultRows = Array.from({ length: 3 }, (_, index) => {
    const row = document.createElement('tr')
    const label = document.createElement('th')
    label.scope = 'row'
    label.textContent = `第 ${index + 1} 局`
    const home = document.createElement('td')
    const away = document.createElement('td')
    row.append(label, home, away)
    ui('result-rows').append(row)
    return { row, home, away }
  })

  let menuOpen = true
  let latestState: GameState | null = null
  let activeDialog: DialogKind = null
  let returnFocus: HTMLElement | null = null
  let soundEnabled = true
  let predictionEnabled = true
  let mode: SessionOptions['mode'] = 'match'
  let destroyed = false
  const events = new AbortController()
  const { signal } = events

  // Avoid replacing text nodes every animation frame (including live-region announcements).
  function text(node: HTMLElement, value: string): void {
    if (node.textContent !== value) node.textContent = value
  }

  function currentDialog(): HTMLElement | null {
    return activeDialog === 'menu' ? menuDialog : activeDialog ? breakDialog : null
  }

  function focusables(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]'))
      .filter(node => !node.closest('[hidden]'))
  }

  function showDialog(kind: DialogKind): void {
    const previous = activeDialog
    activeDialog = kind
    hud.hidden = menuOpen
    hud.inert = kind !== null
    layer.hidden = kind === null
    menuDialog.hidden = kind !== 'menu'
    breakDialog.hidden = kind === null || kind === 'menu'
    if (previous === kind) return
    if (kind) {
      if (!previous && document.activeElement instanceof HTMLElement) returnFocus = document.activeElement
      const dialog = currentDialog()!
      const primary = kind === 'menu' ? difficulty : kind === 'paused' ? resumeButton
        : kind === 'set_end' ? nextSetButton : restartButton
      ;(primary.hidden ? dialog : primary).focus({ preventScroll: true })
    } else {
      const focus = returnFocus
      returnFocus = null
      if (focus?.isConnected && !focus.closest('[hidden], [inert]')) focus.focus({ preventScroll: true })
      else if (document.activeElement instanceof HTMLElement && layer.contains(document.activeElement)) document.activeElement.blur()
    }
  }

  function refreshSettings(): void {
    const persona = getPersona(personaSelect.value)
    const selectedDifficulty = difficulty.value as SessionOptions['difficulty']
    const selectedStyle = style.value as SessionOptions['style']
    const selectedLoadout = loadout.value as SessionOptions['loadout']
    text(element('#play-difficulty-note'), DIFFICULTY_NOTES[selectedDifficulty])
    text(element('#play-style-note'), STYLE_NOTES[selectedStyle])
    text(element('#play-persona-note'), `${persona.name}：${persona.bio}`)
    text(element('#play-loadout-note'), LOADOUT_NOTES[selectedLoadout])
    const racket = RACKETS[selectedLoadout]
    text(ui('racket-spec'), `平衡点 ${racket.balance} mm / 线床 ${racket.tension} lb / 挥重参数 ${racket.swingweight}`)
  }

  function refreshToggles(): void {
    text(soundButton, `声音 ${soundEnabled ? '开' : '关'}`)
    soundButton.setAttribute('aria-pressed', String(soundEnabled))
    const prediction = mode === 'training' && predictionEnabled
    predictionButton.disabled = mode !== 'training'
    predictionButton.setAttribute('aria-pressed', String(prediction))
    predictionButton.title = mode === 'training' ? '显示或隐藏预测落点，仅作参考' : '仅训练模式可用'
    text(predictionButton, `预测 ${prediction ? '开' : '关'}`)
  }

  function start(selectedMode: SessionOptions['mode']): void {
    mode = selectedMode
    menuOpen = false
    latestState = null
    predictionEnabled = true
    refreshToggles()
    showDialog(null)
    callbacks.start({
      mode, persona: personaSelect.value as PersonaId,
      difficulty: difficulty.value as SessionOptions['difficulty'],
      style: style.value as SessionOptions['style'], loadout: loadout.value as SessionOptions['loadout'],
    })
    // Do not call these during construction: the caller may still be initializing its UI handle.
    callbacks.sound(soundEnabled)
    callbacks.prediction(mode === 'training' && predictionEnabled)
  }

  function showMenu(): void {
    if (destroyed) return
    menuOpen = true
    showDialog('menu')
  }

  function openMenu(): void {
    showMenu()
    callbacks.menu()
  }

  function pointMessage(state: GameState): string {
    const point = state.lastPoint
    if (!point) return ''
    const winner = point.winner === 0 ? '你' : '对手'
    const loser = point.winner === 0 ? '对手' : '你'
    return `${winner}得分 · ${point.reason === 'in' ? '' : loser}${POINT_REASON[point.reason]}`
  }

  function update(state: GameState): void {
    if (destroyed) return
    latestState = state
    mode = state.mode
    const match = state.match
    const phase = state.phase === 'paused' ? state.pausedPhase : state.phase
    const ended = phase === 'set_end' || phase === 'match_end'
    const completed = match ? match.sets.slice(0, match.currentSet + (ended ? 1 : 0)) : []
    const homeWins = completed.filter(set => set.home > set.away).length
    const awayWins = completed.filter(set => set.away > set.home).length
    const training = state.mode === 'training'
    text(modeLabel, training ? '自由训练 · 不计比分' : '单打比赛 · 三局两胜')
    const opponent = getPersona(personaSelect.value)
    text(awayName, opponent.name)
    text(homeScore, training ? '—' : String(match?.points[0] ?? 0))
    text(awayScore, training ? '—' : String(match?.points[1] ?? 0))
    text(setScore, training ? `不计局分 · 累计接球 ${state.training.returns} 拍`
      : `局比分 ${homeWins} : ${awayWins} · 第 ${(match?.currentSet ?? 0) + 1} 局`)
    const serving = training ? 0 : match?.server ?? 0
    text(server, `${serving === 0 ? '你' : opponent.name}发球 · ${match?.serviceSide === 'left' ? '左' : '右'}区${match?.isDeuce && !training ? ' · 加分阶段' : ''}`)
    text(rally, `本回合 ${state.rallyHits} 拍`)
    pauseButton.disabled = state.phase === 'set_end' || state.phase === 'match_end'
    refreshToggles()

    trainingPanel.hidden = !training
    const best = Math.max(state.training.bestRally, state.rallyHits)
    const shotCount = new Set(state.training.shots.filter(shot => SHOT_ORDER.includes(shot))).size
    // Training has no separate serve flag; rallyId is incremented only by a successful serve.
    const tasks = [state.training.moved > 0.1, state.rallyId > 0, state.training.returns > 0, best >= 6, shotCount >= 6]
    const nextTask = tasks.findIndex(done => !done)
    tasks.forEach((done, index) => {
      taskRows[index].dataset.complete = String(done)
      taskRows[index].dataset.current = String(index === nextTask)
      text(taskLabels[index], done ? '完成' : index === nextTask ? '现在' : '待完成')
    })
    text(trainingSummary, `最长 ${best} 拍 · 球路 ${shotCount} / 6${tasks.every(Boolean) ? ' · 全部完成' : ''}`)

    const player = state.players[0]
    const ratio = player && player.maxStamina > 0 ? player.stamina / player.maxStamina : 0
    const percent = Number.isFinite(ratio) ? Math.round(Math.max(0, Math.min(1, ratio)) * 100) : 0
    if (stamina.value !== percent) stamina.value = percent
    text(stamina, `${percent}%`)
    text(staminaValue, `${percent}%`)
    stamina.dataset.low = String(percent < 25)
    text(footwork, `步法 · ${player ? FOOTWORK[player.movement.footwork] : '准备'}`)
    text(grip, `握拍 · ${player?.grip === 'backhand' ? '反手' : '正手'}`)
    text(body, `身体 · ${player ? BODY_PHASE[player.body.phase] : '站稳'}${player?.body.action ? ` / ${BODY_ACTION[player.body.action]}` : ''}`)
    body.dataset.phase = player?.body.phase ?? 'grounded'
    const lateral = player?.aim.lateral ?? 0
    const depth = player?.aim.depth ?? 0
    text(aim, `落点 · ${lateral < 0 ? '左路' : lateral > 0 ? '右路' : '中路'} / ${depth < 0 ? '偏浅' : depth > 0 ? '偏深' : '标准深度'}`)

    // Reuse the contact candidates only; no interception/trajectory prediction in the HUD.
    const shuttle = state.shuttle
    const ownHalf = player && shuttle && (player.side === 0 ? shuttle.pos[0] < -0.025 : shuttle.pos[0] > 0.025)
    const canReceive = state.phase === 'playing' && state.lastHitter === 1 && !state.netTouched && ownHalf
    const legalShots = training && canReceive && player && shuttle ? getLegalShots(player, shuttle) : []
    const recovering = player?.swing.phase === 'recovery'
    const open = legalShots.length > 0 && !recovering
    contactWindow.hidden = !training
    if (training) {
      contactWindow.dataset.open = String(open)
      text(legalShotsText, state.phase === 'paused' ? '已暂停'
        : state.phase !== 'playing' ? '等待发球 / 下一回合'
        : state.netTouched ? '触网 · 等待回合结束'
        : !canReceive ? '等待来球进入己方半场'
        : recovering ? '回拍恢复中 · 等待下一次击球'
        : open ? legalShots.map(shot => `${SHOT_CONTROLS[shot].key} ${SHOT_NAMES[shot]}`).join(' / ')
        : '窗口未到 · 调整站位与击球高度')
    }
    shotItems.forEach((item, index) => {
      const shot = SHOT_ORDER[index]
      const available = String(training && open && legalShots.includes(shot))
      if (item.dataset.available !== available) item.dataset.available = available
      const selected = shot === player?.selectedShot
      if (item.dataset.selected === String(selected)) return
      item.dataset.selected = String(selected)
      if (selected) item.setAttribute('aria-current', 'true')
      else item.removeAttribute('aria-current')
    })
    // 键盘提示在触屏下被触屏按钮取代，可打窗口的高亮镜像到触屏按钮上。
    touchShotButtons.forEach((button, index) => {
      const shot = SHOT_ORDER[index]
      const available = String(training && open && legalShots.includes(shot))
      if (button.dataset.available !== available) button.dataset.available = available
      const selected = String(shot === player?.selectedShot)
      if (button.dataset.selected !== selected) button.dataset.selected = selected
    })
    const point = pointMessage(state)
    text(statusTitle, state.phase === 'paused' ? '已暂停 · Esc 继续'
      : state.phase === 'match_end' ? '比赛结束'
      : state.phase === 'set_end' ? '本局结束'
      : point ? `${state.phase === 'idle' ? '上一分：' : ''}${point}`
      : state.phase === 'idle' ? (serving === 0 ? '站进发球区 · J 高远 / K 小球 / I 反手小 / L 平射 直接发出' : '准备接发 · 对手即将发球')
      : '回合进行中 · J / K / L / U / I / O 直接击球')
    text(feedback, player?.feedback || '先到位再起跳，空中不能二次起跳，落地要恢复。')

    if (menuOpen) {
      showDialog('menu')
      return
    }
    if (state.phase === 'paused' || state.phase === 'set_end' || state.phase === 'match_end') {
      const paused = state.phase === 'paused'
      const final = state.phase === 'match_end'
      text(breakEyebrow, paused ? 'TAKE A BREATH' : final ? 'MATCH / COMPLETE' : 'CHANGE ENDS')
      text(breakTitle, paused ? '暂停一下' : final ? (homeWins > awayWins ? '这场，属于你。' : '好球，下场再来。') : `第 ${(match?.currentSet ?? 0) + 1} 局结束`)
      text(breakDescription, paused ? '比赛已暂停。调整呼吸，准备好后继续。'
        : final ? `最终局比分 ${homeWins} : ${awayWins}。本场已结束，不会自动重开。`
        : '交换场地，重新寻找节奏。准备好后手动开始下一局。')
      resultScore.hidden = training || !match
      text(resultScore, match ? `你 ${match.points[0]} : ${match.points[1]} 对手` : '')
      resultTable.hidden = training || !match
      resultRows.forEach(({ row, home, away }, index) => {
        row.hidden = !match || index > match.currentSet
        if (!match || index > match.currentSet) return
        text(home, String(match.sets[index].home))
        text(away, String(match.sets[index].away))
      })
      text(resultPoint, point)
      resultPoint.hidden = !point
      resumeButton.hidden = !paused
      nextSetButton.hidden = paused || final
      text(restartButton, final ? '再战一场' : '重新开始')
      restartButton.classList.toggle('play-button-primary', final)
      restartButton.classList.toggle('play-button-paper', !final)
      text(dialogNote, final ? '每一局的实际比分保留在上方。再战将开始一场新比赛。' : '重新开始将清空本场进度；返回菜单可重新选择配置。')
      showDialog(state.phase)
    } else showDialog(null)
  }

  difficulty.addEventListener('change', refreshSettings, { signal })
  style.addEventListener('change', refreshSettings, { signal })
  loadout.addEventListener('change', refreshSettings, { signal })
  personaSelect.addEventListener('change', () => {
    const persona = getPersona(personaSelect.value)
    difficulty.value = persona.difficulty
    style.value = persona.style
    refreshSettings()
  }, { signal })
  ui('start-training').addEventListener('click', () => start('training'), { signal })
  ui('start-match').addEventListener('click', () => start('match'), { signal })
  pauseButton.addEventListener('click', () => callbacks.pause(), { signal })
  resumeButton.addEventListener('click', () => callbacks.pause(), { signal })
  restartButton.addEventListener('click', () => callbacks.restart(), { signal })
  nextSetButton.addEventListener('click', () => callbacks.nextSet(), { signal })
  ui('menu').addEventListener('click', openMenu, { signal })
  ui('return-menu').addEventListener('click', openMenu, { signal })
  recordButton.addEventListener('click', () => callbacks.record(), { signal })
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled
    refreshToggles()
    callbacks.sound(soundEnabled)
  }, { signal })
  predictionButton.addEventListener('click', () => {
    if (mode !== 'training') return
    predictionEnabled = !predictionEnabled
    refreshToggles()
    callbacks.prediction(predictionEnabled)
  }, { signal })

  // Capture before the game's bubbling keyboard adapter. Native select/button defaults
  // remain intact, but modal keys must never serve, swing or move the player underneath.
  window.addEventListener('keydown', event => {
    const dialog = currentDialog()
    if (!dialog) return
    event.stopImmediatePropagation()
    if (event.key === 'Tab') {
      const items = focusables(dialog)
      const first = items[0] ?? dialog
      const last = items[items.length - 1] ?? dialog
      const focused = document.activeElement
      if (!dialog.contains(focused) || focused === dialog || (event.shiftKey ? focused === first : focused === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    } else if (event.key === 'Escape' && !(event.target instanceof HTMLSelectElement)) {
      event.preventDefault()
      if (!event.repeat && activeDialog === 'paused' && latestState?.phase === 'paused') callbacks.pause()
    }
  }, { capture: true, signal })
  window.addEventListener('keyup', event => {
    if (currentDialog()) event.stopImmediatePropagation()
  }, { capture: true, signal })
  document.addEventListener('focusin', event => {
    const dialog = currentDialog()
    if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      ;(focusables(dialog)[0] ?? dialog).focus({ preventScroll: true })
    }
  }, { signal })
  for (const name of ['keydown', 'keyup'] as const) {
    root.addEventListener(name, event => {
      if (!(event.target instanceof Element)) return
      // Enter/Space activate controls, not a serve. Other game keys remain usable
      // after clicking a toolbar button, without requiring an extra court click.
      if (event.target.closest('select') || (event.target.closest('button') && (event.key === 'Enter' || event.key === ' '))) event.stopPropagation()
    }, { signal })
  }

  if (touch) {
    // 训练任务里指向键盘的两处文案换成触屏说法，避免移动端给出按不到的键。
    text(ui('move-key'), '摇杆')
    text(ui('serve-key'), '发球键')
  }
  refreshSettings()
  refreshToggles()
  showDialog('menu')

  return {
    update,
    touchRoot: ui('touch'),
    showMenu,
    setRecording(recording: boolean): void {
      if (destroyed) return
      recordButton.setAttribute('aria-pressed', String(recording))
      recordButton.dataset.recording = String(recording)
      text(recordButton, recording ? '停止录像' : '开始录像')
      recordButton.title = recording ? '正在录制，点击停止并保存' : '手动开始录像，不会自动录制'
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      events.abort()
      root.remove()
      if (returnFocus?.isConnected && !returnFocus.closest('[hidden], [inert]')) returnFocus.focus({ preventScroll: true })
      returnFocus = null
      latestState = null
    },
  }
}
