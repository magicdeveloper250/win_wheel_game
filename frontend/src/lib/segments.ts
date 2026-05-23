// utils/segments.ts
// Shared segment data and helper utilities

export interface Segment {
  label: string;
  color?: number;
  value: string;
  grad?: [number, number];
  multiplier?:number
}



export function easeOut(t: number, p = 4): number {
  return 1 - Math.pow(1 - t, p);
}

export function segmentAtTop(rotation: number, count: number): number {
  const step = (Math.PI * 2) / count;
  const raw = -rotation / step - 0.5;
  return ((Math.floor(raw + 0.5) % count) + count) % count;
}

export const BASE_SIZE = 800;
export const OUTER_DURATION = 7;
export const MIDDLE_DURATION = 5;
export const OUTER_RADIUS = 300;
export const MIDDLE_RADIUS = 190;
export const INNER_RADIUS = 40;
