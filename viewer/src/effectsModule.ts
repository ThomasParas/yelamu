import type { AppModule } from "./modules";
import {
  VEGETATION_LAYER,
  WATER_MOTION_DISABLED_REASON,
  WATER_MOTION_LAYER,
  defaultVegetationOn,
  degradeMessage,
  effectiveEffects,
  type EffectiveEffects,
} from "./effects";
import { createIdleAnimator } from "./water/idleAnimator";

/** How often the water is redrawn while the camera is still. */
export const IDLE_WATER_FPS = 15;

/**
 * Vegetation and animated water: the two layer toggles, the automatic quality level that
 * can switch them off on a slow device, the prefers-reduced-motion rule, and the idle
 * animator that keeps the water moving while nobody is interacting. The rules live in
 * effects.ts; this module only connects them to the shell, the layer selection and the
 * scene objects.
 */
export const effectsModule: AppModule = (ctx) => {
  const { layers, shell, quality, vegetation, water } = ctx;
  const media = (query: string) => (typeof matchMedia === "function" ? matchMedia(query) : null);
  const reducedMq = media("(prefers-reduced-motion: reduce)");
  const coarse = media("(pointer: coarse)")?.matches ?? false;
  const reduced = () => reducedMq?.matches ?? false;

  // A visitor who switches an effect ON while the controller has switched it off expects to
  // see it: give them full quality again (the controller will step down again if needed).
  const userTurnedOn = () => {
    if (quality.level() < 2) quality.reset(2);
  };

  const handles = new Map<string, ReturnType<typeof shell.addToggle>>();
  if (vegetation) {
    const on = layers.register(VEGETATION_LAYER, defaultVegetationOn(coarse));
    handles.set(
      VEGETATION_LAYER,
      shell.addToggle(VEGETATION_LAYER, "Vegetation", on, (v) => {
        if (v) userTurnedOn(); // before the layer change, which applies the level
        layers.set(VEGETATION_LAYER, v);
      }),
    );
  }
  const waterOn = layers.register(WATER_MOTION_LAYER, true);
  handles.set(
    WATER_MOTION_LAYER,
    shell.addToggle(WATER_MOTION_LAYER, "Water motion", waterOn, (v) => {
      if (v) userTurnedOn();
      layers.set(WATER_MOTION_LAYER, v);
    }),
  );

  const effective = (): EffectiveEffects =>
    effectiveEffects({
      vegetation: vegetation !== null && layers.has(VEGETATION_LAYER),
      waterMotion: layers.has(WATER_MOTION_LAYER),
      level: quality.level(),
      reducedMotion: reduced(),
    });

  const idle = createIdleAnimator(() => ctx.requestIdleRender(), {
    fps: IDLE_WATER_FPS,
    enabled: () => effective().waterAnimation,
  });

  let current: EffectiveEffects = { vegetation: false, waterAnimation: false };
  const apply = (): EffectiveEffects => {
    const before = current;
    current = effective();
    vegetation?.setEnabled(current.vegetation);
    water.setAnimated(current.waterAnimation);
    if (current.waterAnimation) idle.start();
    else idle.stop();

    // Toggles mirror the layer selection (the URL hash can change it); under reduced
    // motion the water toggle is shown off and disabled, with the reason as its tooltip.
    handles.get(VEGETATION_LAYER)?.set(layers.has(VEGETATION_LAYER));
    const waterHandle = handles.get(WATER_MOTION_LAYER)!;
    if (reduced()) {
      waterHandle.set(false);
      waterHandle.disable(WATER_MOTION_DISABLED_REASON);
    } else {
      waterHandle.enable();
      waterHandle.set(layers.has(WATER_MOTION_LAYER));
    }
    ctx.requestRender();
    return before;
  };

  layers.onChange(() => void apply());
  reducedMq?.addEventListener?.("change", () => void apply());
  quality.onChange((level, previous) => {
    const before = apply();
    const message = degradeMessage(level, previous, before, current);
    if (message) shell.toast(message);
  });

  // Chunks built while vegetation was off (or hidden by the quality level) get their plants
  // here, a few per frame, once it is on and the chunk is in view.
  if (vegetation) {
    ctx.onFrame(() => {
      if (vegetation.refresh(ctx.terrain.visibleLod0Meshes())) ctx.requestRender();
    });
  }

  apply();
};
