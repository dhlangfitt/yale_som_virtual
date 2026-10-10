import { forwardRef, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Labubu from './Labubu.jsx'

// Professor Tauhid Zaman: hoodie, glasses, a Labubu swinging off his belt loop,
// and BLACKPINK pink on everything. Teaches MGT 409 in 2200.

const HOODIE = '#141418'
const PINK = '#ff4fa3'
const SKIN = '#c98f5f'
const HAIR = '#17110d'
const JEANS = '#2f3b52'

const mats = new Map()
const m = (color, o = {}) => {
  const k = color + JSON.stringify(o)
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...o }))
  return mats.get(k)
}

const SPH = new THREE.SphereGeometry(1, 24, 16)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const TORUS = new THREE.TorusGeometry(1, 0.12, 8, 24)
const CAP = new THREE.CapsuleGeometry(1, 1, 6, 12)

const B = ({ g = SPH, c, p, s, r = [0, 0, 0], o }) => (
  <mesh geometry={g} material={m(c, o)} position={p} scale={s} rotation={r} />
)

/** Pink "BP" chest graphic, drawn once to a canvas. */
function chestTex() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = HOODIE
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = PINK
  g.font = 'bold 110px Helvetica, Arial, sans-serif'
  g.textAlign = 'center'
  g.fillText('BP', 128, 150)
  g.fillRect(58, 178, 140, 10)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const Zaman = forwardRef(function Zaman(
  { position = [0, 0, 0], rotation = 0, phase = 0, facing = null, talking = false, onClick },
  ref,
) {
  const root = useRef()
  const armR = useRef()
  const head = useRef()
  const chest = useMemo(() => new THREE.MeshStandardMaterial({ map: chestTex(), roughness: 0.85 }), [])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + phase
    const g = root.current
    if (!g) return

    // Turn to face the student while they're talking to him; otherwise scan the room.
    let want = rotation + Math.sin(t * 0.4) * 0.35
    if (facing) {
      want = Math.atan2(facing.x - g.position.x, facing.z - g.position.z)
    }
    // shortest-arc lerp so he never spins the long way round
    const d = ((want - g.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    g.rotation.y += d * Math.min(1, dt * (facing ? 6 : 2))

    // gestures: bigger when he's mid-explanation
    const amp = talking ? 1 : 0.35
    armR.current.rotation.x = -0.35 - Math.max(0, Math.sin(t * 2.1)) * 0.9 * amp
    armR.current.rotation.z = -0.22 - Math.max(0, Math.sin(t * 1.4)) * 0.3 * amp
    head.current.rotation.x = Math.sin(t * 1.8) * 0.05 * amp
  })

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={1.82 / 1.9}>
      {/* Click target: one capsule around the whole body, so the raycast doesn't have
          to land on a finger. Fully transparent rather than visible={false}, because
          an invisible mesh is unreliable to raycast against. */}
      <mesh ref={ref} geometry={CAP} position={[0, 1.0, 0]} scale={[0.42, 0.62, 0.42]} onClick={onClick}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* legs — dark jeans */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={CAP} material={m(JEANS)} position={[0.1 * sx, 0.42, 0]} scale={[0.09, 0.26, 0.1]} />
      ))}
      {[-1, 1].map((sx) => (
        <B key={sx} g={BOX} c="#e9e9ec" p={[0.1 * sx, 0.055, 0.03]} s={[0.11, 0.07, 0.24]} />
      ))}

      {/* hoodie body + pocket + pink hem */}
      <mesh
        geometry={new THREE.CylinderGeometry(0.235, 0.275, 0.78, 26)}
        material={m(HOODIE)}
        position={[0, 1.05, 0]}
      />
      <B g={CYL} c={PINK} p={[0, 0.67, 0]} s={[0.277, 0.035, 0.277]} />
      <B g={BOX} c="#1d1d22" p={[0, 0.88, 0.2]} s={[0.3, 0.17, 0.03]} />
      {/* chest graphic */}
      <mesh geometry={BOX} material={chest} position={[0, 1.16, 0.233]} scale={[0.25, 0.25, 0.012]} />
      {/* hood, bunched behind the neck */}
      <B c={HOODIE} p={[0, 1.42, -0.13]} s={[0.21, 0.13, 0.15]} />
      <B g={TORUS} c={HOODIE} p={[0, 1.44, -0.02]} r={[1.3, 0, 0]} s={[0.18, 0.18, 0.18]} />
      {/* drawstrings */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B g={CYL} c="#f2f2f4" p={[0.05 * sx, 1.28, 0.21]} s={[0.008, 0.14, 0.008]} />
          <B c={PINK} p={[0.05 * sx, 1.2, 0.21]} s={[0.014, 0.014, 0.014]} />
        </group>
      ))}

      {/* arms */}
      <group position={[0.27, 1.34, 0]} rotation={[0.1, 0, 0.2]}>
        <mesh geometry={CAP} material={m(HOODIE)} position={[0, -0.22, 0]} scale={[0.062, 0.18, 0.062]} />
        <B g={CYL} c={PINK} p={[0, -0.41, 0]} s={[0.064, 0.025, 0.064]} />
        <mesh geometry={SPH} material={m(SKIN)} position={[0, -0.47, 0.02]} scale={[0.045, 0.055, 0.04]} />
      </group>
      <group ref={armR} position={[-0.27, 1.34, 0]}>
        <mesh geometry={CAP} material={m(HOODIE)} position={[0, -0.22, 0]} scale={[0.062, 0.18, 0.062]} />
        <B g={CYL} c={PINK} p={[0, -0.41, 0]} s={[0.064, 0.025, 0.064]} />
        <mesh geometry={SPH} material={m(SKIN)} position={[0, -0.47, 0.02]} scale={[0.045, 0.055, 0.04]} />
      </group>

      {/* the Labubu on his belt loop */}
      <group position={[0.2, 0.66, 0.14]}>
        <B g={CYL} c="#9aa0a8" o={{ metalness: 0.9, roughness: 0.25 }} p={[0, 0.03, 0]} s={[0.006, 0.08, 0.006]} />
        <Labubu height={0.2} fur="#e7c7a8" expression="mischief" shirt={PINK} anim="idle" phase={phase + 2} position={[0, -0.18, 0]} />
      </group>

      {/* head */}
      <group ref={head}>
        <B c={SKIN} p={[0, 1.58, 0]} s={[0.12, 0.14, 0.13]} />
        {[-1, 1].map((sx) => (
          <B key={sx} c={SKIN} p={[0.122 * sx, 1.58, 0]} s={[0.02, 0.035, 0.02]} />
        ))}
        {/* hair + short beard */}
        <B c={HAIR} p={[0, 1.65, -0.01]} s={[0.126, 0.1, 0.132]} />
        <B c={HAIR} p={[0, 1.5, 0.06]} s={[0.1, 0.07, 0.1]} />
        <B c={SKIN} p={[0, 1.5, 0.11]} s={[0.055, 0.035, 0.06]} />
        {/* eyes */}
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <B c="#ffffff" p={[0.045 * sx, 1.605, 0.112]} s={[0.022, 0.018, 0.012]} />
            <B c="#1d1410" p={[0.045 * sx, 1.605, 0.122]} s={[0.011, 0.012, 0.008]} />
            <B g={BOX} c={HAIR} p={[0.047 * sx, 1.642, 0.115]} r={[0, 0, -0.08 * sx]} s={[0.045, 0.011, 0.01]} />
          </group>
        ))}
        {/* glasses */}
        {[-1, 1].map((sx) => (
          <B key={sx} g={TORUS} c="#2a2a30" o={{ metalness: 0.5, roughness: 0.4 }} p={[0.047 * sx, 1.605, 0.124]} s={[0.032, 0.03, 0.03]} />
        ))}
        <B g={BOX} c="#2a2a30" p={[0, 1.605, 0.126]} s={[0.03, 0.006, 0.006]} />
        <B c={SKIN} p={[0, 1.572, 0.128]} s={[0.021, 0.028, 0.024]} />
        {/* grin */}
        <B g={BOX} c="#6b2f2a" p={[0, 1.532, 0.118]} s={[0.052, 0.009, 0.008]} />
      </group>
    </group>
  )
})

export default Zaman
