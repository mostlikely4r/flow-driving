// F-24: wipers in the cockpit, and the faint drops they clear. Interior view
// only: the group goes into the cockpit, which only the cockpit camera sees.
//
// The windscreen runs from the dash top (y 1.0, z 1.26) up to the header
// (y 1.42, z 0.45) in the car's front-group frame; the blades sweep in that
// plane from their parked place along the bottom.
import * as THREE from 'three';

const SWEEP_S = 1.2; // one sweep up and back
const PARK = -1.45; // rad: parked, lying along the bottom of the screen toward +x
const UP = 0.15; // rad: the top of the sweep, just past upright

function dropsTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 17;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = r() * 256, y = r() * 256, s = 0.6 + r() * r() * 3.2;
    const grd = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.6, 'rgba(200,210,220,0.35)');
    grd.addColorStop(1, 'rgba(200,210,220,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWipers() {
  const group = new THREE.Group();
  group.visible = false;
  // the glass plane: bottom edge A, top edge B
  const A = new THREE.Vector3(0, 1.005, 1.245);
  const B = new THREE.Vector3(0, 1.4, 0.47);
  const up = B.clone().sub(A).normalize();
  const out = new THREE.Vector3(1, 0, 0).cross(up).normalize(); // points out of the car
  const frame = new THREE.Group();
  frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up, out));
  frame.position.copy(A).addScaledVector(out, -0.03); // just inside the glass
  group.add(frame);

  const mat = new THREE.MeshStandardMaterial({ color: 0x0d0e0f, roughness: 0.6 });
  const arms = [];
  for (const px of [-0.62, 0.12]) {
    const arm = new THREE.Group();
    arm.position.set(px, 0.05, 0);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.6, 0.008), mat);
    rod.position.y = 0.3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.58, 0.014), mat);
    blade.position.set(0.012, 0.33, -0.004);
    arm.add(rod, blade);
    frame.add(arm);
    arms.push(arm);
  }

  // the drops: a faint film on the glass that builds up between sweeps
  const len = A.distanceTo(B);
  // (lit, not glowing: by day they catch the sky, at night they are nearly gone)
  const drops = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, len * 0.86),
    new THREE.MeshStandardMaterial({ map: dropsTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, roughness: 0.2 }),
  );
  drops.position.set(0, len * 0.47, 0.015); // between the blades and the glass, clear of the header
  drops.rotation.y = Math.PI; // faces into the car
  drops.renderOrder = 20;
  frame.add(drops);

  let t = 0;
  return {
    group,
    /** Sweep while it rains. `on` false parks the blades and dries the glass. */
    update(dt, on) {
      group.visible = on;
      if (!on) return;
      t = (t + dt) % SWEEP_S;
      const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / SWEEP_S);
      const a = PARK + (UP - PARK) * k;
      for (const arm of arms) arm.rotation.z = a;
      // just wiped at the top of the sweep; the drops come back until the next one
      const since = ((t - SWEEP_S / 2 + SWEEP_S) % SWEEP_S) / SWEEP_S;
      drops.material.opacity = 0.05 + 0.22 * since;
    },
  };
}
