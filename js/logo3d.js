import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// Extrudes the traced logo outline into a 3D wireframe object
// that keeps turning to face the pointer anywhere on the page.

const container = document.getElementById('logo');
const fallback = container.querySelector('img');

const OUTLINE_URL = 'images/dev-and-drive-outline.svg';
const SVG_SIZE = 800;       // viewBox size of the outline SVG
const WORLD_SIZE = 10;      // logo spans this many world units
const DEPTH = 45;           // extrusion depth, in SVG units
const MAX_YAW = 0.75;       // radians the logo turns left/right
const MAX_PITCH = 0.5;      // radians the logo turns up/down
const WIRE_COLOR = new THREE.Color(0x0096ff);

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

// One solid + wireframe mesh per colored path in the SVG
function buildLogo(svg) {
  const logo = new THREE.Group();

  for (const path of svg.paths) {
    const color = path.color;
    const geometry = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth: DEPTH,
      bevelEnabled: false,
    });
    // SVG y points down; rotating (not mirroring) keeps face winding intact
    geometry.rotateX(Math.PI);

    const lineColor = color.clone().lerp(WIRE_COLOR, 0.6).offsetHSL(0, 0, 0.15);

    // Push the solid faces back slightly so the wireframe drawn on top doesn't z-fight
    const faceMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const sideMaterial = new THREE.MeshBasicMaterial({
      color: lineColor.clone().multiplyScalar(0.15),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // ExtrudeGeometry groups: 0 = front/back caps, 1 = side walls
    logo.add(new THREE.Mesh(geometry, [faceMaterial, sideMaterial]));

    // Faint triangle mesh across every face
    logo.add(new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.25 })
    ));

    // Bright outlines; a low threshold keeps every side-wall edge for a ribbed look
    logo.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.9 })
    ));
  }

  // Center the logo on the origin and scale it to world units
  const box = new THREE.Box3().setFromObject(logo);
  const center = box.getCenter(new THREE.Vector3());
  logo.children.forEach((child) => child.geometry.translate(-center.x, -center.y, -center.z));
  logo.scale.setScalar(WORLD_SIZE / SVG_SIZE);

  return logo;
}

async function init() {
  const svg = await new SVGLoader().loadAsync(OUTLINE_URL);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', fallback.alt);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 12;

  const pivot = new THREE.Group();
  pivot.add(buildLogo(svg));
  scene.add(pivot);

  function resize() {
    const size = container.clientWidth;
    renderer.setSize(size, size);
  }
  resize();
  window.addEventListener('resize', resize);

  // Pointer position relative to the logo center, normalized to the window (-1..1)
  const target = new THREE.Vector2(0, 0);
  let hasPointer = false;

  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    target.set(
      THREE.MathUtils.clamp((event.clientX - cx) / (window.innerWidth / 2), -1, 1),
      THREE.MathUtils.clamp((event.clientY - cy) / (window.innerHeight / 2), -1, 1)
    );
    hasPointer = true;
  }
  window.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerleave', () => { hasPointer = false; });

  fallback.style.display = 'none';

  // Start edge-on and swing around to face the viewer
  pivot.rotation.y = -Math.PI / 2;

  const clock = new THREE.Clock();
  function animate() {
    const t = clock.getElapsedTime();

    // Without a pointer (touch devices, pointer off-page) drift gently
    const yaw = hasPointer ? target.x * MAX_YAW : Math.sin(t * 0.6) * 0.35;
    const pitch = hasPointer ? target.y * MAX_PITCH : Math.sin(t * 0.4) * 0.12;

    pivot.rotation.y += (yaw - pivot.rotation.y) * 0.06;
    pivot.rotation.x += (pitch - pivot.rotation.x) * 0.06;
    pivot.position.y = Math.sin(t * 1.2) * 0.08;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (supportsWebGL() && !reducedMotion) {
  init().catch((err) => {
    console.error('3D logo failed, keeping static image', err);
    fallback.style.display = '';
  });
}
