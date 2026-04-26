// utils/segments.ts
// Shared segment data and helper utilities

export interface Segment {
  label: string;
  color?: number;
  value: number | string;
  grad?: [number, number];
}

export const OUTER_SEGMENTS: Segment[] = [
  { label: "10", color: 0xc0392b, value: 10 },
  { label: "20", color: 0x1a1a1a, value: 20 },
  { label: "14", color: 0xc0392b, value: 14 },
  { label: "31", color: 0x1a1a1a, value: 31 },
  { label: "9", color: 0xc0392b, value: 9 },
  { label: "22", color: 0x1a1a1a, value: 22 },
  { label: "18", color: 0xc0392b, value: 18 },
  { label: "29", color: 0x1a1a1a, value: 29 },
  { label: "7", color: 0xc0392b, value: 7 },
  { label: "28", color: 0x1a1a1a, value: 28 },
  { label: "12", color: 0xc0392b, value: 12 },
  { label: "35", color: 0x1a1a1a, value: 35 },
  { label: "3", color: 0xc0392b, value: 3 },
  { label: "26", color: 0x1a1a1a, value: 26 },
  { label: "0", color: 0x39ff25, value: 0 },
  { label: "32", color: 0x1a1a1a, value: 32 },
  { label: "15", color: 0xc0392b, value: 15 },
  { label: "19", color: 0x1a1a1a, value: 19 },
  { label: "4", color: 0xc0392b, value: 4 },
  { label: "21", color: 0x1a1a1a, value: 21 },
  { label: "2", color: 0xc0392b, value: 2 },
  { label: "25", color: 0x1a1a1a, value: 25 },
  { label: "17", color: 0xc0392b, value: 17 },
  { label: "34", color: 0x1a1a1a, value: 34 },
  { label: "6", color: 0xc0392b, value: 6 },
  { label: "27", color: 0x1a1a1a, value: 27 },
  { label: "13", color: 0xc0392b, value: 13 },
  { label: "36", color: 0x1a1a1a, value: 36 },
  { label: "11", color: 0xc0392b, value: 11 },
  { label: "30", color: 0x1a1a1a, value: 30 },
  { label: "8", color: 0xc0392b, value: 8 },
  { label: "23", color: 0x1a1a1a, value: 23 },
  { label: "10", color: 0xc0392b, value: 10 },
  { label: "5", color: 0x1a1a1a, value: 5 },
  { label: "24", color: 0xc0392b, value: 24 },
  { label: "16", color: 0x1a1a1a, value: 16 },
  { label: "33", color: 0xc0392b, value: 33 },
  { label: "1", color: 0x1a1a1a, value: 1 },
];

export const MIDDLE_SEGMENTS: Segment[] = [
  { label: "A", value: "A", color: 0x000000, grad: [0xc0392b, 0xffd000] },
  { label: "B", value: "B", color: 0x000000, grad: [0xc0392b, 0xff9500] },
  { label: "C", value: "C", color: 0x000000, grad: [0xc0392b, 0xffe000] },
  { label: "D", value: "D", color: 0x000000, grad: [0xc0392b, 0xffb300] },
  { label: "E", value: "E", color: 0x000000, grad: [0xc0392b, 0xffc200] },
  { label: "F", value: "F", color: 0x000000, grad: [0xc0392b, 0xffda00] },
];

export function easeOut(t: number, p = 4): number {
  return 1 - Math.pow(1 - t, p);
}

export function segmentAtTop(rotation: number, count: number): number {
  const step = (Math.PI * 2) / count;
  const raw = -rotation / step - 0.5;
  return ((Math.floor(raw + 0.5) % count) + count) % count;
}

export const BASE_SIZE = 800;
export const OUTER_DURATION = 3800;
export const MIDDLE_DURATION = 3000;
export const OUTER_RADIUS = 300;
export const MIDDLE_RADIUS = 190;
export const INNER_RADIUS = 40;
