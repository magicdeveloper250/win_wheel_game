import { prisma } from "../lib/prisma";
import { GameSessionStatus } from "../generated/prisma/enums";

export const getNextSession = async () => {
  // Clean up only genuinely stuck ACTIVE sessions (e.g. after server restart)
  // Do NOT touch COMPLETED sessions — spin() manages those
  await prisma.gameSession.updateMany({
    where: { status: GameSessionStatus.ACTIVE },
    data: { status: GameSessionStatus.UPCOMING },
  });

  let next = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.UPCOMING },
    orderBy: { sessionNumber: "asc" },
    include: { multiplier: true },
  });

  // No upcoming — recycle completed
  if (!next) {
    await prisma.gameSession.updateMany({
      where: { status: GameSessionStatus.COMPLETED },
      data: { status: GameSessionStatus.UPCOMING },
    });

    next = await prisma.gameSession.findFirst({
      where: { status: GameSessionStatus.UPCOMING },
      orderBy: { sessionNumber: "asc" },
      include: { multiplier: true },
    });
  }

  if (!next) throw { error: "No sessions available. Please seed the database." };

  const active = await prisma.gameSession.update({
    where: { id: next.id },
    data: { status: GameSessionStatus.ACTIVE },
    include: { multiplier: true },
  });

  return active;
};

export const spin = async (params: { winNumber: number }) => {
  const activeSession = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.ACTIVE },
    include: { multiplier: true, gameBets: true },
  });

  if (!activeSession) throw { error: "No active session. Call GET /spin/next first." };

  const winMultiplier = activeSession.multiplier.winMultiplier;

  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: { sessionId: activeSession.id, winNumber: params.winNumber, winMultiplier },
    });

    for (const bet of activeSession.gameBets) {
      if (bet.targetNumber === params.winNumber) {
        const payout = bet.amount.mul(winMultiplier);
        await tx.transaction.create({
          data: { userId: bet.userId, amount: payout, type: "WIN_PAYOUT", tax: 0 },
        });
      }
    }

    await tx.gameSession.update({
      where: { id: activeSession.id },
      data: { status: GameSessionStatus.COMPLETED },
    });

    return gameResult;
  });

  // Recycle if no upcoming sessions remain
  const upcomingCount = await prisma.gameSession.count({
    where: { status: GameSessionStatus.UPCOMING },
  });

  if (upcomingCount === 0) {
    await prisma.gameSession.updateMany({
      where: {
        status: GameSessionStatus.COMPLETED,
        id: { not: activeSession.id },
      },
      data: { status: GameSessionStatus.UPCOMING },
    });
  }

  // Now grab next
  const nextSession = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.UPCOMING },
    orderBy: { sessionNumber: "asc" },
    include: { multiplier: true },
  });

  if (nextSession) {
    await prisma.gameSession.update({
      where: { id: nextSession.id },
      data: { status: GameSessionStatus.ACTIVE },
    });
  }

  return {
    completedSession: { id: activeSession.id, sessionNumber: activeSession.sessionNumber },
    winNumber: params.winNumber,
    result,
    nextSession: nextSession ?? null,
  };
};