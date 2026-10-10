import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Professor, { PROFESSORS } from './Professor.jsx'
import Zaman from './Zaman.jsx'
import { DRUMS, LECTERNS } from './layout.js'

// which professor teaches in which classroom (matches the slide decks).
// Zaman teaches MGT 409, which the registrar puts in EVANS 2200 — so accounting
// and Snape moved up to 2400.
export const ROOM_PROFESSOR = {
  2400: 'snape', // MGT 402 Basics of Accounting
  2410: 'mcgonagall', // MGT 404 Basics of Economics
  2420: 'trelawney', // MGT 403 Probability Modeling & Statistics
  2430: 'slughorn', // MGT 887 Negotiations
  2200: 'zaman', // MGT 409 AI Foundations for Managers
  2210: 'lockhart', // MGT 538 Mastering Influence & Persuasion
  2220: 'moody', // MGT 800 Crisis Management in Tech
  2230: 'flitwick', // MGT 541 Corporate Finance
}

const NAMES = { ...Object.fromEntries(Object.entries(PROFESSORS).map(([k, v]) => [k, v.name])), zaman: 'Tauhid Zaman' }

function plaqueTex(name) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#c9a44a'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#2a1d0c'
  g.fillRect(8, 8, 496, 112)
  g.fillStyle = '#f3dfa8'
  g.font = 'bold 44px Georgia, serif'
  g.textAlign = 'center'
  g.fillText(`Prof. ${name.split(' ').slice(-1)[0]}`, 256, 80)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** How close you have to be before he'll notice you, in metres. */
const TALK_RANGE = 6

export default function Faculty({ onTalk, talkingTo, onAim }) {
  const { camera, gl } = useThree()
  const zamanHit = useRef()
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const centre = useMemo(() => new THREE.Vector2(0, 0), [])
  const [aimed, setAimed] = useState(false)

  const items = useMemo(
    () =>
      DRUMS.map((d, i) => {
        const who = ROOM_PROFESSOR[d.id]
        const { fc, back, t, half, rot } = d.front
        const lec = LECTERNS[i]
        return {
          who,
          pos: [fc[0] + back[0] * 1.15 - t[0] * half * 0.3, 0, fc[1] + back[1] * 1.15 - t[1] * half * 0.3],
          rot,
          plaque: {
            p: [lec.x + back[0] * 0.26, 0.85, lec.z + back[1] * 0.26],
            rot,
            mat: new THREE.MeshBasicMaterial({ map: plaqueTex(NAMES[who]) }),
          },
        }
      }),
    [],
  )

  const zaman = items.find((it) => it.who === 'zaman')

  // Is the crosshair on him, and are we close enough to talk?
  useFrame(() => {
    if (!zamanHit.current || talkingTo) return
    const near = camera.position.distanceTo(new THREE.Vector3(...zaman.pos)) < TALK_RANGE
    let hit = false
    if (near) {
      ray.setFromCamera(centre, camera)
      hit = ray.intersectObject(zamanHit.current, false).length > 0
    }
    if (hit !== aimed) {
      setAimed(hit)
      onAim?.(hit)
    }
  })

  // Pointer lock swallows normal click targeting, so raycast from screen centre instead.
  useEffect(() => {
    const el = gl.domElement
    const click = () => {
      if (!document.pointerLockElement || !zamanHit.current || talkingTo) return
      if (camera.position.distanceTo(new THREE.Vector3(...zaman.pos)) >= TALK_RANGE) return
      ray.setFromCamera(centre, camera)
      if (ray.intersectObject(zamanHit.current, false).length > 0) onTalk?.('zaman')
    }
    el.addEventListener('click', click)
    return () => el.removeEventListener('click', click)
  }, [gl, camera, ray, centre, onTalk, talkingTo, zaman])

  return (
    <>
      {items.map((it, i) =>
        it.who === 'zaman' ? (
          <Zaman
            key={i}
            ref={zamanHit}
            position={it.pos}
            rotation={it.rot}
            phase={i * 1.7}
            facing={talkingTo === 'zaman' ? camera.position : null}
            talking={talkingTo === 'zaman'}
            onClick={(e) => {
              // joystick / unlocked mode: R3F's own pointer events still work
              e.stopPropagation()
              if (!document.pointerLockElement) onTalk?.('zaman')
            }}
          />
        ) : (
          <Professor key={i} who={it.who} position={it.pos} rotation={it.rot} phase={i * 1.7} />
        ),
      )}
      {items.map((it, i) => (
        <mesh key={`p${i}`} position={it.plaque.p} rotation={[0, it.plaque.rot, 0]} material={it.plaque.mat}>
          <planeGeometry args={[0.6, 0.15]} />
        </mesh>
      ))}
      {/* Hagrid keeps an eye on the Labubus in the courtyard */}
      <Professor who="hagrid" position={[-10.5, -5, -2]} rotation={Math.PI / 2} />
    </>
  )
}
