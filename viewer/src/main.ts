import * as THREE from "three";
import { createIsoCamera, fitViewSize } from "./camera";
import { switchZoomFor } from "./chunks";
import type { AppContext } from "./appContext";
import { decodeState, encodeState, type AppState } from "./appState";
import { attachKeyboard, attachPointerControls } from "./controls";
import { GROUP_COLORS, buildPalette, makeColorAt, makeShadeFactorAt, paletteToLinear, shadeByDepth } from "./habitat";
import { createHabitatMaterial } from "./habitatMaterial";
import { loadHabitat, loadHeightmap, loadShadeBytes, type HeightmapMeta } from "./heightmap";
import { datasetFromSearch } from "./dataset";
import { loadFailureMessage } from "./loadError";
import { createHashSync } from "./hashSync";
import { LayerSelection } from "./layerSelection";
import { initModules } from "./modules";
import { PlaceSelection } from "./placeSelection";
import { QualityController } from "./quality";
import { pickSurpriseTarget, type SurpriseTarget } from "./surprise";
import { pickRandomLandPoint } from "./randomLand";
import { SCENE_BACKGROUND } from "./theme";
import { TerrainChunks } from "./terrainChunks";
import { copyText } from "./ui/clipboard";
import { createShell } from "./ui/shell";
import "./ui/ui.css";
import { VegetationLayer } from "./vegetation/layer";
import { ViewRig, unitsPerPixel } from "./viewRig";
import { computeShoreField } from "./water/shoreField";
import { createWaterMaterial } from "./water/waterMaterial";
import { SUN_DIRECTION, VERTICAL_EXAGGERATION, makeTerrainShade, shadeProblem, withShade } from "./terrainShade";

// Ground below the water surface darkens down to this depth (metres, real scale).
const MAX_SHADE_DEPTH_M = 6;
// Ground colour for datasets without a habitat raster (the old flat tan).
const FALLBACK_GROUND = 0xa89f78;
// The coarse LOD (every 4th sample) is replaced by full resolution once its vertices
// would be more than this many screen pixels apart. See switchZoomFor in chunks.ts.
const MAX_COARSE_SPACING_PX = 6;

// The sea and sea floor planes must stay past the screen edges even when fully zoomed out on the
// grey ring (the view then spans about 100 km, seen at 45 degrees).
const SEA_PLANE_FACTOR = 14;

// Which dataset folder under public/assets/ to load: the real city unless `?data=<name>` asks
// for another (`slice`, or the synthetic `city-synth` from npm run make:city-synth).
const params = new URLSearchParams(location.search);
const dataset = datasetFromSearch(location.search);
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/${dataset}`;
const DEBUG = params.has("debug");
const BENCH = params.has("bench"); // on-screen phone benchmark (see bench.ts)

// Camera limits. The target may stray this fraction of the larger map half-extent past the edge.
const TARGET_MARGIN_FRACTION = 0.15;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 40;
// "Surprise me" flies in to this multiple of the zoom where full-resolution terrain starts.
const SURPRISE_ZOOM_FACTOR = 1.3;
// Screen pixels one arrow-key press pans by (Shift = 3x).
const KEY_PAN_STEP_PX = 60;

// The shell does not need any data, so it exists before loading and can show errors.
const shell = createShell(document.getElementById("ui")!);
shell.setStatus("Loading...");

async function start() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BACKGROUND);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(...SUN_DIRECTION); // the baked ground shading assumes this direction
  scene.add(sun);

  const { meta, heights } = await loadHeightmap(ASSET_BASE);
  const [habitat, shadeBytes] = await Promise.all([loadHabitat(ASSET_BASE, meta), loadShadeBytes(ASSET_BASE, meta)]);

  // Palette entries are sRGB; vertex colours are read as linear by three.js.
  const palette = paletteToLinear(buildPalette(habitat ? (meta.habitat_classes ?? []) : []));
  // With a habitat raster a class id missing from the legend is "unmapped" grey, never a
  // guessed ground tan; the tan is only for datasets without any habitat data.
  const fallback = new THREE.Color(habitat ? GROUP_COLORS.unmapped : FALLBACK_GROUND); // linear
  // With a habitat raster the colours are painted per pixel by the habitat material (soft
  // edges) and the vertex colour only carries the darkening (depth under water, baked shade).
  // Without one the old per-vertex colours are used.
  const habitatMaterial = habitat
    ? createHabitatMaterial({
        habitat,
        width: meta.width,
        height: meta.height,
        cellM: meta.cell_m,
        palette,
        fallback: [fallback.r, fallback.g, fallback.b],
      })
    : null;
  const baseColorAt = habitatMaterial
    ? makeShadeFactorAt(meta.water_level_m, MAX_SHADE_DEPTH_M)
    : makeColorAt(palette, habitat, meta.water_level_m, MAX_SHADE_DEPTH_M, [fallback.r, fallback.g, fallback.b]);
  const colorAt = withGroundShade(baseColorAt, meta, shadeBytes);

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

  // Plants stand on the full-resolution chunks only (the coarse LOD is too rough to plant on).
  // The layer starts disabled; the effects module switches it on from the layer toggle and the
  // quality level, and chunks built before that are planted lazily (see VegetationLayer.refresh).
  const vegetation = habitat
    ? new VegetationLayer({
        size: meta,
        heights,
        habitat,
        classes: meta.habitat_classes ?? [],
        waterLevelM: meta.water_level_m,
        exaggeration: VERTICAL_EXAGGERATION,
      })
    : null;
  vegetation?.setEnabled(false);

  const terrain = new TerrainChunks(
    heights,
    meta,
    VERTICAL_EXAGGERATION,
    colorAt,
    // Smooth: the chunks carry whole-grid normals (flat shading drew every 10 m cell as two
    // differently lit triangles, a diagonal hatching on all slopes).
    habitatMaterial?.material ?? new THREE.MeshStandardMaterial({ vertexColors: true }),
    {
      switchZoom,
      hooks: vegetation
        ? {
            onLod0Built: (plan, mesh) => vegetation.attach(mesh, plan),
            onLod0Evicted: (_plan, mesh) => vegetation.detach(mesh),
          }
        : undefined,
    },
  );
  scene.add(terrain.root);

  const extent = Math.max(meta.width, meta.height) * meta.cell_m;
  // The same translucent blue as before; moving ripples are switched on by the effects module.
  const waterFx = createWaterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(extent * SEA_PLANE_FACTOR, extent * SEA_PLANE_FACTOR).rotateX(-Math.PI / 2), waterFx.material);
  water.position.y = meta.water_level_m * VERTICAL_EXAGGERATION;
  scene.add(water);

  // A sea floor under the translucent water, coloured like the deepest bay cells and lit
  // like the terrain (same material type), so the edge of the data square is invisible
  // from the open water beyond it. Half a metre below the lowest terrain to avoid z-fighting.
  const deep = new THREE.Color(GROUP_COLORS.water); // linear working space
  const [fr, fg, fb] = shadeByDepth([deep.r, deep.g, deep.b], meta.min_m, meta.water_level_m, MAX_SHADE_DEPTH_M);
  const seaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * SEA_PLANE_FACTOR, extent * SEA_PLANE_FACTOR).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(fr, fg, fb) }),
  );
  seaFloor.position.y = (meta.min_m - 0.5) * VERTICAL_EXAGGERATION;
  scene.add(seaFloor);

  const camera = createIsoCamera(fitViewSize(widthM, depthM, maxHeightM, aspect0), aspect0);

  // Debug overlay (?debug): rolling fps over the last frames, renderer stats, LOD state.
  const overlay = DEBUG ? document.createElement("div") : null;
  if (overlay) {
    overlay.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:20;padding:6px 10px;background:rgba(0,0,0,.7);" +
      "color:#fff;border-radius:6px;font:12px/1.4 ui-monospace,monospace;white-space:pre;pointer-events:none";
    document.body.appendChild(overlay);
  }
  const quality = new QualityController();
  const frameTimes: number[] = [];
  let lastFrame = 0;
  const trackFrame = (now: number, buildingChunks: boolean) => {
    // Rendering is on demand, so skip the idle gaps between interactions (>= 500 ms).
    if (lastFrame && now - lastFrame < 500) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length > 60) frameTimes.shift();
      // The burst of full-resolution chunk builds after a zoom-in is not steady-state
      // cost, so those frames do not count towards the quality level.
      if (!buildingChunks) quality.record(now - lastFrame);
    }
    lastFrame = now;
  };
  const updateOverlay = () => {
    if (!overlay) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / (frameTimes.length || 1);
    const s = terrain.stats();
    const veg = vegetation?.stats() ?? { instances: 0, meshes: 0 };
    overlay.textContent =
      `fps        ${avg > 0 ? (1000 / avg).toFixed(0) : "-"}\n` +
      `draw calls ${renderer.info.render.calls}\n` +
      `triangles  ${renderer.info.render.triangles.toLocaleString()}\n` +
      `LOD        ${s.lod} (switch at zoom ${switchZoom.toFixed(2)}, now ${camera.zoom.toFixed(2)})\n` +
      `LOD0 chunks resident ${s.lod0Resident}, visible ${s.lod0Visible}\n` +
      `quality    level ${quality.level()} (p90 ${Number.isFinite(quality.p90()) ? quality.p90().toFixed(1) : "-"} ms)\n` +
      `vegetation ${vegetation ? `${veg.instances.toLocaleString()} instances, ${veg.meshes} meshes` : "none"}`;
  };

  // One render per animation frame, however many times it is requested. update() may
  // return true when chunks are still being built, so keep going until it settles.
  const frameCallbacks = new Set<() => void>();
  const onFrame = (cb: () => void) => {
    frameCallbacks.add(cb);
    return () => void frameCallbacks.delete(cb);
  };
  let queued = false;
  let interactive = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame((now) => {
      queued = false;
      const wasInteractive = interactive;
      interactive = false;
      waterFx.setTime(now / 1000);
      if (!wasInteractive) {
        // Only the idle water animation asked for this frame: nothing else has changed, so
        // skip the terrain update and the post-render callbacks (label layout), and do not
        // let the ~15 fps cadence reach the quality controller as if it were slow rendering.
        renderer.render(scene, camera);
        lastFrame = 0;
        return;
      }
      const pending = terrain.update(camera);
      renderer.render(scene, camera);
      for (const cb of [...frameCallbacks]) {
        try {
          cb();
        } catch (err) {
          // A broken callback must not stop rendering; drop it after the first failure.
          frameCallbacks.delete(cb);
          console.error("frame callback failed and was removed", err);
        }
      }
      trackFrame(now, pending);
      updateOverlay();
      if (pending) requestRender();
    });
  };
  const requestRender = () => {
    interactive = true;
    schedule();
  };
  const requestIdleRender = () => schedule();
  // Shallows and foam need a shore field (~0.1 s to compute): do it after the first frame so
  // it never delays the map appearing; the shoreline fills in a moment later.
  requestAnimationFrame(() =>
    setTimeout(() => {
      const t0 = performance.now();
      const field = computeShoreField(heights, meta.width, meta.height, meta.water_level_m);
      waterFx.setShore({ field, width: meta.width, height: meta.height, cellM: meta.cell_m });
      console.info(`shore field: ${(performance.now() - t0).toFixed(0)} ms`);
      requestIdleRender();
    }, 0),
  );
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const halfWidth = widthM / 2;
  const halfDepth = depthM / 2;
  const rig = new ViewRig(camera, {
    bounds: { halfWidth, halfDepth },
    margin: TARGET_MARGIN_FRACTION * Math.max(halfWidth, halfDepth),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    reducedMotion,
  });

  // Shared state from the URL hash: view pose and enabled layers.
  const fromHash = decodeState(location.hash);
  rig.setState({ x: fromHash.x, z: fromHash.z, zoom: fromHash.zoom, rot: fromHash.rot });
  // No `l` in the hash: each layer takes its default. `l=` (empty): everything optional is off.
  const layers = new LayerSelection(fromHash.layers);
  const place = new PlaceSelection(fromHash.place);

  const appState = (): AppState => ({
    ...rig.getState(),
    layers: layers.hashValue(),
    place: place.get(),
  });
  const writeHash = (encoded: string) => {
    try {
      // Keep the path and the ?data= / ?debug query; only the fragment changes.
      history.replaceState(history.state, "", `${location.pathname}${location.search}#${encoded}`);
    } catch {
      // replaceState can throw in sandboxed frames; the URL just stays as it is.
    }
  };
  const hashSync = createHashSync({ getState: appState, write: writeHash });
  rig.onChange(() => {
    requestRender();
    hashSync.schedule();
  });
  layers.onChange(() => hashSync.schedule());
  place.onChange(() => hashSync.schedule());
  window.addEventListener("pagehide", () => hashSync.flush());
  // A hand-edited or pasted hash on the same page: apply it (replaceState does not fire this).
  window.addEventListener("hashchange", () => {
    const next = decodeState(location.hash);
    rig.setState({ x: next.x, z: next.z, zoom: next.zoom, rot: next.rot });
    if (next.layers) layers.replace(next.layers);
    place.set(next.place);
    hashSync.markCurrent();
    // Whatever the app rejected or clamped (an unknown place, an out-of-range zoom) must not
    // linger in the address bar: rewrite the fragment from the state that was actually applied.
    const applied = encodeState(appState());
    if (location.hash !== `#${applied}`) writeHash(applied);
  });

  attachPointerControls(canvas, camera, rig);

  const surpriseTargets: SurpriseTarget[] = [];
  const handlers: AppContext["handlers"] = {
    search: () => {},
    help: () => {},
    escape: () => void shell.closeTopPanel(),
  };
  attachKeyboard(
    window,
    rig,
    {
      onSearch: () => handlers.search(),
      onHelp: () => handlers.help(),
      onEscape: () => handlers.escape(),
      panStepPx: KEY_PAN_STEP_PX,
    },
    () => unitsPerPixel(camera, canvas.clientHeight),
  );

  shell.onReset(() => rig.reset());
  shell.onRotate((dir) => rig.rotate(dir));
  shell.onSurprise(() => {
    const target = pickSurpriseTarget(surpriseTargets, Math.random);
    if (target) {
      rig.flyTo(target.x, target.z, target.zoom);
      place.set(target.place);
      return;
    }
    place.set(undefined);
    const spot = pickRandomLandPoint(heights, meta, meta.water_level_m, Math.random);
    if (!spot) {
      shell.toast("No dry land to visit");
      return;
    }
    rig.flyTo(spot.x, spot.z, switchZoom * SURPRISE_ZOOM_FACTOR);
  });
  shell.onCopyLink(async () => {
    hashSync.flush(); // make sure the address bar holds the view being shared
    const ok = await copyText(location.href);
    shell.toast(ok ? "Link copied" : "Could not copy the link");
  });

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
    rig.place();
    requestRender();
  };
  window.addEventListener("resize", resize);
  resize();

  shell.setStatus(
    `${meta.width}x${meta.height} cells at ${meta.cell_m} m. Drag to pan, scroll to zoom, Q and E to rotate.`,
  );

  const ctx: AppContext = {
    canvas,
    scene,
    camera,
    renderer,
    rig,
    shell,
    meta,
    heights,
    habitat,
    terrain,
    requestRender,
    requestIdleRender,
    quality,
    vegetation,
    water: waterFx,
    assetBase: ASSET_BASE,
    verticalExaggeration: VERTICAL_EXAGGERATION,
    layers,
    place,
    surpriseTargets,
    extraPlaces: [],
    onFrame,
    handlers,
  };
  if (DEBUG) (window as unknown as { __yelamu: AppContext }).__yelamu = ctx;
  void initModules(ctx).then(() => {
    if (BENCH) void import("./bench").then((m) => m.startBench(ctx));
  });
}

start().catch((err) => {
  console.error(err);
  shell.setStatus(loadFailureMessage(err, DEBUG));
});

/** The terrain colour function with the baked ground shading applied, when there is a usable bake. */
function withGroundShade(
  colorAt: (cellIndex: number, heightM: number) => [number, number, number],
  meta: HeightmapMeta,
  bytes: Uint8Array | null,
): (cellIndex: number, heightM: number) => [number, number, number] {
  if (!meta.shade || !bytes) return colorAt;
  const problem = shadeProblem(meta.shade, meta);
  if (problem) {
    console.warn(`ground shading ignored: ${problem}`);
    return colorAt;
  }
  try {
    return withShade(colorAt, makeTerrainShade(meta.shade, meta, bytes), meta.water_level_m);
  } catch (err) {
    console.warn("ground shading ignored", err);
    return colorAt;
  }
}
