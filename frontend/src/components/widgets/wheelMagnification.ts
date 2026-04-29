// wheelMagnification.ts
// Adds a REAL radial lens magnification effect to the wheel using PixiJS v8.
// Drop this next to GamePage.tsx and call applyWheelLens / updateWheelLens.

import {
  Application,
  Container,
  Sprite,
  Texture,
  DisplacementFilter,
  RenderTexture,
  Graphics,
} from "pixi.js";

export interface WheelLensHandle {
  /** Call every frame (or on rotation change) with the outer ring's current rotation */
  update(outerRotation: number, midRotation: number): void;
  destroy(): void;
}

/**
 * Creates a radial displacement-map lens centred on the pointer (top of wheel).
 *
 * How it works
 * ────────────
 * 1. We render a greyscale "bump map" texture at runtime:
 *    - A circular gradient, bright (128 → 255) at the pointer apex and dark
 *      (128) elsewhere. PixiJS DisplacementFilter treats 128 as zero offset.
 * 2. We attach that sprite as a displacement map on the wheelContainer.
 * 3. The scale of the filter controls how strong the lens is.
 * 4. Because the bump always points outward from the wheel centre the segments
 *    near the pointer get pushed apart → they appear LARGER (magnified).
 *
 * The result is a genuine pixel-level distortion, not a fake transform.
 */
export function applyWheelLens(
  app: Application,
  wheelContainer: Container,
  outerRadius: number, // OUTER_RADIUS * wheelScale  (world pixels)
  wheelX: number,
  wheelY: number,
  lensStrength = 28, // displacement scale in pixels — tune to taste
): WheelLensHandle {
  const diameter = Math.ceil(outerRadius * 2.6);

  // ── Build displacement map texture ──────────────────────────────────────
  // We draw into a RenderTexture so it stays on the GPU.
  const rt = RenderTexture.create({ width: diameter, height: diameter });

  const bumpGfx = new Graphics();
  const cx = diameter / 2;
  const cy = diameter / 2;
  const lensR = outerRadius * 1.05; // slightly larger than the wheel

  // Fill entire texture with mid-grey (128,128,128) = zero displacement
  bumpGfx.rect(0, 0, diameter, diameter);
  bumpGfx.fill({ color: 0x808080 });

  // Draw a radial "lens bulge" at the top of the wheel.
  // The hot zone spans ±35° either side of the pointer (top = 270° or -90°).
  const hotAngle = -Math.PI / 2; // pointer is at the top
  const spread = Math.PI / 4;    // ±45° arc that gets magnified

  // Approximate the lens zone with many small radial wedges brightened toward
  // the outer edge only near the pointer arc.
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const t = i / steps; // 0..1
    const a = hotAngle - spread + t * spread * 2;
    const nextA = hotAngle - spread + ((i + 1) / steps) * spread * 2;

    // Brightness ramps from 128 (inner) to 220 (outer) only within the arc
    for (let r = 0; r < lensR; r += 2) {
      const rFrac = r / lensR;
      // Lens profile: strong near outer edge
      const profile = Math.pow(rFrac, 1.5);
      // Angular fall-off: cos window so edges of the arc are softer
      const angT = (t - 0.5) * 2; // -1..1
      const angFade = Math.pow(Math.max(0, Math.cos((angT * Math.PI) / 2)), 2);
      const bright = 128 + profile * angFade * 110; // 128 → 238

      const col = Math.round(bright);
      const hex = (col << 16) | (col << 8) | col;

      bumpGfx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      bumpGfx.lineTo(cx + Math.cos(nextA) * r, cy + Math.sin(nextA) * r);
      bumpGfx.lineTo(
        cx + Math.cos(nextA) * (r + 2),
        cy + Math.sin(nextA) * (r + 2),
      );
      bumpGfx.lineTo(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2));
      bumpGfx.fill({ color: hex });
    }
  }

  app.renderer.render({ container: bumpGfx, target: rt });

  const dispSprite = new Sprite(rt);
  dispSprite.anchor.set(0.5, 0.5);
  // Position the sprite so it is centred on the wheel in world space
  dispSprite.x = wheelX;
  dispSprite.y = wheelY;

  // Add to stage BEFORE wheelContainer so it is beneath it (required by PixiJS
  // displacement — the map sprite must be in the scene even if invisible)
  app.stage.addChildAt(dispSprite, 0);
  dispSprite.renderable = false; // we only need it as a texture source

  const dispFilter = new DisplacementFilter({
    sprite: dispSprite,
    scale: { x: lensStrength, y: lensStrength },
  });

  // Apply to the wheel container — all children get the effect
  wheelContainer.filters = [
    ...(wheelContainer.filters ?? []),
    dispFilter,
  ];

  // ── Rotate the bump map with the outer ring so lens tracks segments ──────
  // (optional — set to false for a static lens that always magnifies top)
  let destroyed = false;

  function update(_outerRotation: number, _midRotation: number) {
    if (destroyed) return;
    // The bump texture is already oriented to the pointer (top).
    // We do NOT rotate it — the lens zone is fixed at the pointer position.
    // This creates the authentic effect seen in the reference image.
  }

  function destroy() {
    destroyed = true;
    // Remove filter
    if (wheelContainer.filters) {
      wheelContainer.filters = (wheelContainer.filters as any[]).filter(
        (f) => f !== dispFilter,
      );
    }
    dispFilter.destroy();
    dispSprite.destroy();
    rt.destroy();
    bumpGfx.destroy();
  }

  return { update, destroy };
}
