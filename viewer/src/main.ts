import * as THREE from "three";
import { createIsoCamera } from "./camera";
import { attachControls } from "./controls";
import { loadHeightmap } from "./heightmap";
import { buildTerrainGeometry } from "./terrainMesh";

// Real hills are gentle at this scale; a diorama needs them exaggerated to read.
const VERTICAL_EXAGGERATION = 3;
// Slightly above sea level so the 0.5 m marsh reads as shallow water, not dry land.
const WATER_LEVEL = 0.6;
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/slice`;

async function start() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const status = document.getElementById("status")!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6e9);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-1, 1.2, 0.6);
  scene.add(sun);

  const { meta, heights } = await loadHeightmap(ASSET_BASE);

  const terrain = new THREE.Mesh(
    buildTerrainGeometry(heights, meta, VERTICAL_EXAGGERATION),
    new THREE.MeshStandardMaterial({ color: 0xa89f78, flatShading: true }),
  );
  scene.add(terrain);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f7fa6, transparent: true, opacity: 0.8 }),
  );
  water.position.y = WATER_LEVEL * VERTICAL_EXAGGERATION;
  scene.add(water);

  const camera = createIsoCamera(extent * 0.9, canvas.clientWidth / canvas.clientHeight);
  const render = () => renderer.render(scene, camera);
  const controls = attachControls(canvas, camera, render);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = (camera.top - camera.bottom) / 2;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    controls.place();
  };
  window.addEventListener("resize", resize);
  resize();

  status.textContent = `${meta.width}x${meta.height} cells at ${meta.cell_m} m. Drag to pan, scroll to zoom.`;
}

start().catch((err) => {
  console.error(err);
  document.getElementById("status")!.textContent = `Failed to load: ${err.message}`;
});
