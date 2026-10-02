import * as THREE from 'three'
import type { GameState } from '../game/types'
import type { TickAIConfigs } from '../game/tickService'
import { getShuttleShadow, updateCamera } from '../render/camera'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { syncPlayerMotion, updateGroundMarker } from '../render/playerMesh'
import { syncShuttlecockMesh } from '../render/shuttlecockMesh'
import type { TrailSystem } from '../render/trajectory'
import type { PlayViewState } from './viewState'
import { advanceSimulation } from './simulation'
import { predictLandingPoint } from '../physics/shuttlecock'
import { getShotTarget } from '../character/stroke'
import { predictShotOpportunity, type ShotOpportunity } from '../character/interception'

export interface PlaySceneObjects {
  awayGroundMarker: THREE.Group
  awayMesh: THREE.Group
  camera: THREE.PerspectiveCamera
  homeGroundMarker: THREE.Group
  homeMesh: THREE.Group
  scene: THREE.Scene
  shuttleGroup: THREE.Group
  shuttleShadow: THREE.Mesh
  landingMarker: THREE.Mesh
  targetMarker: THREE.Mesh
  serviceMarker: THREE.Mesh
  trail: TrailSystem
  predictionAt: number
  receptionMarker: THREE.Mesh
  opportunity: ShotOpportunity | null
  opportunityAt: number
}

export function stepFrame(now: number, state: GameState, view: PlayViewState, configs?: TickAIConfigs): GameState {
  const dt = (now - view.lastTime) / 1000
  view.lastTime = now
  const next = advanceSimulation(state, dt, view, configs)
  return next
}

export function syncFrameView(now: number, state: GameState, view: PlayViewState, objects: PlaySceneObjects, prediction: boolean): void {
  if (view.lastRallyId !== state.rallyId) {
    objects.trail.reset()
    view.lastRallyId = state.rallyId
    view.lastHitCount = 0
  }
  if (state.shuttle) {
    syncShuttlecockMesh(objects.shuttleGroup, state.shuttle.pos, state.shuttle.vel)
    objects.shuttleGroup.visible = true
    objects.trail.update(state.shuttle.pos)
    objects.shuttleShadow.visible = true
    const shadow = getShuttleShadow(state.shuttle)
    objects.shuttleShadow.position.set(shadow.position[0], shadow.position[1], shadow.position[2])
    objects.shuttleShadow.scale.setScalar(shadow.scale)
    ;(objects.shuttleShadow.material as THREE.MeshBasicMaterial).opacity = shadow.opacity
    if (state.rallyHits > view.lastHitCount) {
      spawnImpactEffect(state.shuttle.pos, state.players[state.lastHitter ?? 0]?.swing.shot === 'SMASH' ? 1 : 0.6)
      view.lastHitCount = state.rallyHits
    }
    if (prediction && now >= objects.predictionAt) {
      const landing = predictLandingPoint(state.shuttle)
      objects.landingMarker.position.set(landing[0], 0.04, landing[2])
      objects.predictionAt = now + 150
    }
  } else {
    objects.shuttleGroup.visible = false
    objects.shuttleShadow.visible = false
  }
  objects.landingMarker.visible = prediction && state.mode === 'training' && !!state.shuttle
  for (const i of [0, 1] as const) {
    const player = state.players[i]
    if (!player) continue
    syncPlayerMotion(i === 0 ? objects.homeMesh : objects.awayMesh, player, state.elapsed)
    const marker = i === 0 ? objects.homeGroundMarker : objects.awayGroundMarker
    marker.position.set(player.pos[0], 0.02, player.pos[2])
    updateGroundMarker(marker, state.elapsed)
  }
  const home = state.players[0]
  const incoming = home && state.shuttle && state.phase === 'playing' && state.lastHitter === 1 && !state.netTouched
  if (now >= objects.opportunityAt || !incoming) {
    objects.opportunity = incoming ? predictShotOpportunity(home, state.shuttle!, home.swing.phase === 'ready' ? home.selectedShot : home.swing.shot) : null
    // This expensive visual prediction is transient; it never enters GameState.
    objects.opportunityAt = now + 80
  }
  objects.receptionMarker.visible = !!objects.opportunity
  if (objects.opportunity) {
    objects.receptionMarker.position.set(objects.opportunity.position[0], 0.04, objects.opportunity.position[2])
    const material = objects.receptionMarker.material as THREE.MeshBasicMaterial
    material.color.setHex(home?.selectedShot === 'SMASH' ? 0xffb45e : 0x7de5ef)
    material.opacity = 0.55 + Math.sin(now * 0.008) * 0.15
  }
  if (home) {
    const target = getShotTarget(home, home.selectedShot, home.aim)
    objects.targetMarker.position.set(target[0], 0.045, target[2])
    // 等待发球时也亮：触屏是先拖出落点再松手发球，落点环要在按下之前就看得见。
    objects.targetMarker.visible = state.phase === 'playing' || state.phase === 'idle'
  }
  const server = state.mode === 'training' ? 0 : state.match?.server ?? 0
  const servingPlayer = state.players[server]
  objects.serviceMarker.visible = state.phase === 'idle' && !!servingPlayer
  if (servingPlayer) {
    const forward = servingPlayer.side === 0 ? 1 : -1
    const z = forward * (state.match?.serviceSide === 'left' ? -1 : 1)
    objects.serviceMarker.position.set(-forward * 4.34, 0.012, z * 1.295)
  }
  updateCamera(objects.camera, home?.pos, home?.side, state.shuttle?.pos)
  updateEffects(now, objects.scene)
}
