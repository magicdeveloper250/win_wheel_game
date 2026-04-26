// utils/wheelBuilder.ts
// Pure utility: builds PixiJS ring containers from segment data

import { Container, Graphics, Text, TextStyle, Texture } from "pixi.js";
import { BevelFilter, DropShadowFilter, OutlineFilter } from "pixi-filters";
import type { Segment } from "./segments";


export function makeGradientTexture(color1: number, color2: number): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, `#${color1.toString(16).padStart(6, "0")}`);
  grad.addColorStop(1, `#${color2.toString(16).padStart(6, "0")}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export function buildRingContainer(
  segments: Segment[],
  innerR: number,
  outerR: number,
  fontSize: number,
): Container {
  const count = segments.length;
  const angleStep = (Math.PI * 2) / count;
  const ring = new Container();

  segments.forEach((seg, i) => {
    const startA = i * angleStep - Math.PI / 2;
    const endA = startA + angleStep;
    const midA = startA + angleStep / 2;

    const g = new Graphics();
    g.moveTo(Math.cos(startA) * innerR, Math.sin(startA) * innerR);
    g.arc(0, 0, outerR, startA, endA);
    g.arc(0, 0, innerR, endA, startA, true);
    g.closePath();

    if (seg.grad) {
      const tex = makeGradientTexture(seg.grad[0], seg.grad[1]);
      g.fill({ texture: tex });
      g.stroke({ color: 0xffd700, width: 3 });
    } else {
      g.fill({ color: seg.color ?? 0x000000 });
      g.stroke({ color: 0xffd700, width: 1.5 });
    }
    ring.addChild(g);

    const labelR = (innerR + outerR) / 2;
    const lx = Math.cos(midA) * labelR;
    const ly = Math.sin(midA) * labelR;

    const style = new TextStyle({
      fontFamily: "Arial, sans-serif",
      fontSize,
      fill: 0xffffff,
      fontWeight: "bold",
      align: "center",
    });
    const lbl = new Text({ text: seg.label, style });
    lbl.anchor.set(0.5, 0.5);
    lbl.x = lx;
    lbl.y = ly;

    const isLeftHalf = Math.cos(midA) < 0;
    lbl.rotation = isLeftHalf ? midA - Math.PI / 2 : midA + Math.PI / 2;
    lbl.filters = [new OutlineFilter(3, 0x000000, 3)];
    ring.addChild(lbl);
  });

  return ring;
}

export const RING_FILTERS = () => [
  new BevelFilter({
    rotation: 45,
    thickness: 4,
    lightColor: 0xffffff,
    lightAlpha: 0.9,
    shadowColor: 0x000000,
    shadowAlpha: 0.6,
  }),
  new DropShadowFilter({
    offset: { x: 4, y: 8 },
    blur: 6,
    alpha: 0.7,
    color: 0x000000,
  }),
];
