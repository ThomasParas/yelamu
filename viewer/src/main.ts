import * as THREE from "three";
import { createIsoCamera, fitViewSize } from "./camera";
import { switchZoomFor } from "./chunks";
import { attachControls } from "./controls";
import { GROUP_COLORS, buildPalette, makeColorAt, paletteToLinear, shadeByDepth } from "./habitat";
import { loadHabitat, loadHeightmap } from "./heightmap";
import { TerrainChunks } from "./terrainChunks";

// Real hills are gentle at this scale; a diorama needs them exaggerated to read.
const VERTICAL_EXAGGERATION = 3;
// Ground below the water surface darkens down to this depth (metres, real scale).
const MAX_SHADE_DEPTH_M = 6;
// Ground colour for datasets without a habitat raster (the old flat tan).
const FALLBACK_GROUND = 0xa89f78;
// The coarse LOD (every 4th sample) is replaced by full resolution once its vertices
// would be more than this many screen pixels apart. See switchZoomFor in chunks.ts.
const MAX_COARSE_SPACING_PX = 6;

// Which dataset folder under public/assets/ to load. `?data=real` selects the locally
// generated real-data slice (gitignored; see docs/research/slice-results.md);
// `?data=city-synth` the synthetic whole-city grid (npm run make:city-synth). The name
// is restricted so a URL cannot point the loader at arbitrary paths.
const params = new URLSearchParams(location.search);
const requested = params.get("data") ?? "slice";
const dataset = /^[a-z0-9_-]+$/.test(requested) ? requested : "slice";
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/${dataset}`;
const DEBUG = params.has("debug");

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
  const habitat = await loadHabitat(ASSET_BASE, meta);

  // Palette entries are sRGB; vertex colours are read as linear by three.js.
  const palette = paletteToLinear(buildPalette(habitat ? (meta.habitat_classes ?? []) : []));
  // With a habitat raster a class id missing from the legend is "unmapped" grey, never a
  // guessed ground tan; the tan is only for datasets without any habitat data.
  const fallback = new THREE.Color(habitat ? GROUP_COLORS.unmapped : FALLBACK_GROUND); // linear
  const colorAt = makeColorAt(
    palette,
    habitat,
    meta.water_level_m,
    MAX_SHADE_DEPTH_M,
    [fallback.r, fallback.g, fallback.b],
  );

  const widthM = meta.width * meta.cell_m;
  const depthM = meta.height * meta.cell_m;
  const maxHeightM = (meta.max_m - meta.min_m) * VERTICAL_EXAGGERATION;
  const aspect0 = canvas.clientWidth / canvas.clientHeight;
  // The switch zoom depends on the framing, which follows the window aspect, so it is
  // recomputed on every resize (a half-width window fits much more map into view).
  const switchZoomAt = (aspect: number, heightPx: number) =>
    switchZoomFor(
      fitViewSize(widthM, depthM, maxHeightM, aspect),
      heightPx,
      meta.cell_m,
      MAX_COARSE_SPACING_PX,
    );
  let switchZoom = switchZoomAt(aspect0, canvas.clientHeight);

  const terrain = new TerrainChunks(
    heights,
    meta,
    VERTICAL_EXAGGERATION,
    colorAt,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    { switchZoom },
  );
  scene.add(terrain.root);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f7fa6, transparent: true, opacity: 0.8 }),
  );
  water.position.y = meta.water_level_m * VERTICAL_EXAGGERATION;
  scene.add(water);

  // A sea floor under the translucent water, coloured like the deepest bay cells and lit
  // like the terrain (same material type), so the edge of the data square is invisible
  // from the open water beyond it. Half a metre below the lowest terrain to avoid z-fighting.
  const deep = new THREE.Color(GROUP_COLORS.water); // linear working space
  const [fr, fg, fb] = shadeByDepth([deep.r, deep.g, deep.b], meta.min_m, meta.water_level_m, MAX_SHADE_DEPTH_M);
  const seaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 4, extent * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(fr, fg, fb) }),
  );
  seaFloor.position.y = (meta.min_m - 0.5) * VERTICAL_EXAGGERATION;
  scene.add(seaFloor);

  const camera = createIsoCamera(fitViewSize(widthM, depthM, maxHeightM, aspect0), aspect0);

  // Debug overlay (?debug): rolling fps over the last frames, renderer stats, LOD state.
  const overlay = DEBUG ? document.createElement("div") : null;
  if (overlay) {
    overlay.style.cssText =
      "position:fixed;right:12px;top:12px;padding:6px 10px;background:rgba(0,0,0,.7);" +
      "color:#fff;border-radius:6px;font:12px/1.4 ui-monospace,monospace;white-space:pre;pointer-events:none";
    document.body.appendChild(overlay);
  }
  const frameTimes: number[] = [];
  let lastFrame = 0;
  const trackFrame = (now: number) => {
    // Rendering is on demand, so skip the idle gaps between interactions.
    if (lastFrame && now - lastFrame < 500) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length > 60) frameTimes.shift();
    }
    lastFrame = now;
  };
  const updateOverlay = () => {
    if (!overlay) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / (frameTimes.length || 1);
    const s = terrain.stats();
    overlay.textContent =
      `fps        ${avg > 0 ? (1000 / avg).toFixed(0) : "-"}\n` +
      `draw calls ${renderer.info.render.calls}\n` +
      `triangles  ${renderer.info.render.triangles.toLocaleString()}\n` +
      `LOD        ${s.lod} (switch at zoom ${switchZoom.toFixed(2)}, now ${camera.zoom.toFixed(2)})\n` +
      `LOD0 chunks resident ${s.lod0Resident}, visible ${s.lod0Visible}`;
  };

  // One render per animation frame, however many times it is requested. update() may
  // return true when chunks are still being built, so keep going until it settles.
  let queued = false;
  const requestRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame((now) => {
      queued = false;
      const pending = terrain.update(camera);
      renderer.render(scene, camera);
      trackFrame(now);
      updateOverlay();
      if (pending) requestRender();
    });
  };
  const controls = attachControls(canvas, camera, requestRender);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Refit to the current aspect so the whole map stays in view; zoom is left alone.
    const half = fitViewSize(widthM, depthM, maxHeightM, aspect) / 2;
    camera.top = half;
    camera.bottom = -half;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    switchZoom = switchZoomAt(aspect, h);
    terrain.setSwitchZoom(switchZoom);
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
