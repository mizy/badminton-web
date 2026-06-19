import * as THREE from 'three'
import type { GameState } from '../game/types'
import { createCourt } from './court'
import { createGroundMarker, createPlayerMesh, updatePlayerMesh } from './playerMesh'
import { createShuttlecockMesh, syncShuttlecockMesh } from './shuttlecockMesh'
import { createTrailSystem, type TrailSystem } from './trajectory'

export interface RallyViewObjects {
  awayGroundMarker: THREE.Group
  awayMesh: THREE.Group
  homeGroundMarker: THREE.Group
  homeMesh: THREE.Group
  shuttleGroup: THREE.Group
  trail: TrailSystem
}

export function createRallyView(scene: THREE.Scene): RallyViewObjects {
  createCourt(scene)

  const shuttleGroup = createShuttlecockMesh()
  scene.add(shuttleGroup)

  const trail = createTrailSystem(scene)
  const meshOptions = { glowScale: 0.45, labelScale: 0 }
  const homeMesh = createPlayerMesh(
    { body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff },
    'A',
    meshOptions,
  )
  const awayMesh = createPlayerMesh(
    { body: 0xff2255, head: 0xffcc99, racket: 0xcccccc, marker: 0xff44aa },
    'B',
    meshOptions,
  )
  scene.add(homeMesh)
  scene.add(awayMesh)

  const homeGroundMarker = createGroundMarker(0x00ddff)
  const awayGroundMarker = createGroundMarker(0xff2255)
  scene.add(homeGroundMarker)
  scene.add(awayGroundMarker)

  return {
    awayGroundMarker,
    awayMesh,
    homeGroundMarker,
    homeMesh,
    shuttleGroup,
    trail,
  }
}

export function syncRallyView(view: RallyViewObjects, game: GameState): void {
  if (game.shuttle) {
    syncShuttlecockMesh(view.shuttleGroup, game.shuttle.pos, game.shuttle.vel)
    view.shuttleGroup.visible = true
    view.trail.update(game.shuttle.pos)
  } else {
    view.shuttleGroup.visible = false
  }

  const home = game.players[0]
  if (home) {
    updatePlayerMesh(view.homeMesh, home.pos, home.facing)
    view.homeGroundMarker.position.set(home.pos[0], 0.02, home.pos[2])
  }

  const away = game.players[1]
  if (away) {
    updatePlayerMesh(view.awayMesh, away.pos, away.facing)
    view.awayGroundMarker.position.set(away.pos[0], 0.02, away.pos[2])
  }
}

export function disposeRallyView(view: RallyViewObjects): void {
  view.trail.dispose()
}
