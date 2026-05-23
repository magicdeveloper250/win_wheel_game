// src/services/gameSession.ts

import { prisma } from "../lib/prisma";
import { GameSessionStatus } from "../generated/prisma/enums";
import { emitGameEvent, GameEventType } from "../ws/gameEvents";
import { calculateSpinAnimation } from "../services/spinAnimation";
import { randomInt } from "crypto";

const secureRandInt = (min: number, max: number): number => {
  if (min >= max)
    throw new RangeError(`secureRandInt: min (${min}) must be < max (${max})`);
  return randomInt(min, max);
};

const securePickRandom = <T>(arr: T[]): T => {
  if (!arr.length) throw new Error("securePickRandom: array must not be empty");
  return arr[secureRandInt(0, arr.length)];
};

export const startBetSession = async (params: { sessionId: string }) => {
  try {
    const session = await prisma.betSession.create({
      data: { sessionId: params.sessionId },
      include: { session: { include: { multiplier: true } } },
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while creating the bet session." };
  }
};

export const endBetSession = async (params: {
  sessionId: string;
  resultId: string;
}) => {
  try {
    const session = await prisma.betSession.update({
      where: { id: params.sessionId },
      data: {
        status: GameSessionStatus.COMPLETED,
        endTime: new Date(),
        resultId: params.resultId,
      },
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while ending the bet session." };
  }
};

export const cancelBetSession = async (params: { betSessionId: string }) => {
  try {
    const session = await prisma.betSession.update({
      where: { id: params.betSessionId },
      data: {
        status: GameSessionStatus.CANCELLED,
        endTime: new Date(),
      },
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while cancelling the bet session." };
  }
};

export const getNextSession = async () => {
  const { active, nextPreview } = await prisma.$transaction(async (tx) => {
    await tx.betSession.updateMany({
      where: { status: GameSessionStatus.ACTIVE },
      data: { status: GameSessionStatus.CANCELLED, endTime: new Date() },
    });

    const currentActive = await tx.gameSession.findFirst({
      where: { status: GameSessionStatus.ACTIVE },
      include: { multiplier: true },
    });

    if (currentActive) {
      await tx.gameSession.update({
        where: { id: currentActive.id },
        data: { status: GameSessionStatus.COMPLETED },
      });
    }

    let next = await tx.gameSession.findFirst({
      where: {
        status: GameSessionStatus.UPCOMING,
        ...(currentActive && { id: { not: currentActive.id } }),
      },
      orderBy: { sessionNumber: "asc" },
      include: { multiplier: true },
    });

    if (!next) {
      await tx.gameSession.updateMany({
        where: {
          status: GameSessionStatus.COMPLETED,
          ...(currentActive && { id: { not: currentActive.id } }),
        },
        data: { status: GameSessionStatus.UPCOMING },
      });

      next = await tx.gameSession.findFirst({
        where: {
          status: GameSessionStatus.UPCOMING,
          ...(currentActive && { id: { not: currentActive.id } }),
        },
        orderBy: { sessionNumber: "asc" },
        include: { multiplier: true },
      });
    }

    if (!next) {
      throw { error: "No sessions available. Please seed the database." };
    }

    const activeSession = await tx.gameSession.update({
      where: { id: next.id },
      data: { status: GameSessionStatus.ACTIVE },
      include: { multiplier: true },
    });

    const nextPreviewSession = await tx.gameSession.findFirst({
      where: {
        status: GameSessionStatus.UPCOMING,
        id: { not: activeSession.id },
      },
      orderBy: { sessionNumber: "asc" },
      include: { multiplier: true },
    });

    return { active: activeSession, nextPreview: nextPreviewSession };
  });

  await emitGameEvent(GameEventType.SESSION_OPENED, {
    currentSession: {
      id: active.id,
      sessionNumber: active.sessionNumber,
      duration: active.duration,
      multiplier: active.multiplier,
    },
    nextSession: nextPreview
      ? {
          id: nextPreview.id,
          sessionNumber: nextPreview.sessionNumber,
          duration: nextPreview.duration,
          multiplier: nextPreview.multiplier,
        }
      : null,
  });

  return { ...active, nextSessionPreview: nextPreview ?? null };
};

export const spin = async () => {
  const activeBetSession = await prisma.betSession.findFirst({
    where: { status: GameSessionStatus.ACTIVE },
    include: {
      session: { include: { multiplier: true } },
      gameBets: true,
    },
  });

  if (!activeBetSession) {
    throw { error: "No active bet session. Call getNextSession first." };
  }

  const activeGameSession = activeBetSession.session;
  const winMultiplier = activeGameSession.multiplier.winMultiplier;

  const allTargetNumbers = await prisma.gameTargetNumber.findMany({
    select: { targetNumber: true },
    orderBy: { targetNumber: "asc" },
  });

  const allMultipliers = await prisma.gameWinMultiplier.findMany({
    orderBy: { winMultiplier: "asc" },
  });

  const filteredMultiplier = allMultipliers.filter(
    (m) => m.winMultiplier <= winMultiplier,
  );

  if (!allTargetNumbers.length) {
    throw { error: "No target numbers configured." };
  }

  const allNumbers = allTargetNumbers.map((n) => n.targetNumber);

  const decidedWinNumber: number = securePickRandom(allNumbers);
  const decidedWinMultiplier = securePickRandom(filteredMultiplier);

  // Settle bets atomically first
  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: {
        sessionId: activeBetSession.id,
        winNumber: decidedWinNumber,
        winMultiplier: decidedWinMultiplier.multiplierLetter,
      },
    });

    for (const bet of activeBetSession.gameBets) {
      const isNumberBet = !isNaN(Number(bet.targetNumber));

      if (isNumberBet) {
        const bettedNumber = Number(bet.targetNumber);
        if (bettedNumber === decidedWinNumber) {
          const odd = await tx.gameTargetNumber.findFirst({
            where: { targetNumber: bettedNumber },
          });
          if (!odd) continue;
          const payout = bet.amount.mul(odd.multiplierNumber);

          if (bet.userId) {
            await tx.userAccount.update({
              where: { userId: bet.userId },
              data: { balance: { increment: payout } },
            });
          }else if(bet.ticketId){
             await tx.ticket.update({
              where: { id: bet.ticketId },
              data: { won:   true },
            });

          }

          await tx.transaction.create({
            data: {
              userId: bet.userId,
              amount: payout,
              type: "WIN_PAYOUT",
              tax: 0,
            },
          });
        }
      } else {
        if (bet.targetNumber === decidedWinMultiplier.multiplierLetter) {
          const odd = await tx.gameWinMultiplier.findFirst({
            where: { multiplierLetter: bet.targetNumber },
          });
          if (!odd) continue;
          const payout = bet.amount.mul(odd.winMultiplier);

          if (bet.userId) {
            await tx.userAccount.update({
              where: { userId: bet.userId },
              data: { balance: { increment: payout } },
            });
          }else if(bet.ticketId){
             await tx.ticket.update({
              where: { id: bet.ticketId },
              data: { won:   true },
            });

          }

          await tx.transaction.create({
            data: {
              userId: bet.userId,
              amount: payout,
              type: "WIN_PAYOUT",
              tax: 0,
            },
          });
        }
      }
    }

    await tx.betSession.update({
      where: { id: activeBetSession.id },
      data: {
        status: GameSessionStatus.COMPLETED,
        endTime: new Date(),
        resultId: gameResult.id,
      },
    });

    await tx.gameSession.update({
      where: { id: activeGameSession.id },
      data: { status: GameSessionStatus.COMPLETED },
    });

    return gameResult;
  });

  const upcomingCount = await prisma.gameSession.count({
    where: { status: GameSessionStatus.UPCOMING },
  });

  if (upcomingCount === 0) {
    await prisma.gameSession.updateMany({
      where: {
        status: GameSessionStatus.COMPLETED,
        id: { not: activeGameSession.id },
      },
      data: { status: GameSessionStatus.UPCOMING },
    });
  }

  const nextSession = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.UPCOMING },
    orderBy: { sessionNumber: "asc" },
    include: { multiplier: true },
  });

  // Wait for the full animation to finish before broadcasting the result
  const animation = await calculateSpinAnimation(decidedWinNumber);

  const payload = {
    completedSession: {
      id: activeBetSession.id,
      sessionNumber: activeGameSession.sessionNumber,
    },
    winNumber: decidedWinNumber,
    winMultiplier: decidedWinMultiplier.multiplierLetter,
    animation,
    result,
    nextSession: nextSession
      ? {
          id: nextSession.id,
          sessionNumber: nextSession.sessionNumber,
          multiplier: nextSession.multiplier,
        }
      : null,
  };

  await emitGameEvent(GameEventType.SPIN_RESULT, payload);

  return payload;
};
