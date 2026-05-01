
import { prisma } from "../lib/prisma";

export const calculateSpinAnimation = async (winNumber: number) => {
  const numbers = await prisma.gameTargetNumber.findMany({
    orderBy: { targetNumber: "asc" },
  });

  const totalSlots = numbers.length;
  const slotAngle = 360 / totalSlots;

  const winIndex = numbers.findIndex((n) => n.targetNumber === winNumber);

  const finalAngle = winIndex * slotAngle + slotAngle / 2;

  const fullRotations = 5 + Math.floor(Math.random() * 3);
  const totalRotation = fullRotations * 360 + finalAngle;

  const duration = 5000;

  const easing = { x1: 0.25, y1: 0.1, x2: 0.0, y2: 1.0 };

  return {
    startAngle: 0,
    totalRotation,
    finalAngle,
    duration,
    easing,
    winIndex,
    totalSlots,
    slotAngle,
  };
};