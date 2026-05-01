// src/services/gameSession.ts

import { prisma } from "../lib/prisma";
import { GameSessionStatus } from "../generated/prisma/enums";
import { emitGameEvent, GameEventType } from "../ws/gameEvents";
import { calculateSpinAnimation } from "../services/spinAnimation";
import { randomInt } from "crypto";

// ---------------------------------------------------------------------------
// Cryptographically secure helpers
// ---------------------------------------------------------------------------

/**
 * Returns a cryptographically secure random integer in [min, max).
 * Backed by the OS CSPRNG via Node's built-in `crypto.randomInt`.
 *
 * House edge is achieved entirely through the winMultiplier configured
 * per session — NOT by manipulating which number is drawn.
 *
 * Example: 10 numbers, winMultiplier = 8x
 *   True odds  = 10x  →  house keeps (10 - 8) / 10 = 20% of every bet pool.
 *   Players get genuinely fair draws; the math does the rest.
 */
const secureRandInt = (min: number, max: number): number => {
  if (min >= max)
    throw new RangeError(
      `secureRandInt: min (${min}) must be < max (${max})`
    );
  return randomInt(min, max); // inclusive-min, exclusive-max
};

/**
 * Picks a cryptographically secure random element from a non-empty array.
 */
const securePickRandom = <T>(arr: T[]): T => {
  if (!arr.length)
    throw new Error("securePickRandom: array must not be empty");
  return arr[secureRandInt(0, arr.length)];
};

// ---------------------------------------------------------------------------
// BetSession lifecycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session rotation
// ---------------------------------------------------------------------------

export const getNextSession = async () => {
  const { active, nextPreview } = await prisma.$transaction(async (tx) => {
    // Cancel any lingering active bet sessions
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

    // No upcoming sessions — recycle completed ones
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

// ---------------------------------------------------------------------------
// Spin — pure crypto-random draw, house edge via multiplier
// ---------------------------------------------------------------------------

export const spin = async (params: { winNumber?: number }) => {
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

  // -------------------------------------------------------------------------
  // Fetch all valid target numbers
  // -------------------------------------------------------------------------

  const allTargetNumbers = await prisma.gameTargetNumber.findMany({
    select: { targetNumber: true },
    orderBy: { targetNumber: "asc" },
  });

  if (!allTargetNumbers.length) {
    throw { error: "No target numbers configured." };
  }

  const allNumbers = allTargetNumbers.map((n) => n.targetNumber);

  // -------------------------------------------------------------------------
  // Decide winning number
  //
  // Operator override    → use params.winNumber (manual control / testing)
  // Normal spin          → pure cryptographic random from the number pool
  //
  // House edge is entirely encoded in winMultiplier:
  //   edge = 1 - winMultiplier / totalNumbers
  //
  // Example: 10 numbers, multiplier 8x  →  20% house edge per round.
  // No outcome manipulation is needed or performed.
  // -------------------------------------------------------------------------

  const decidedWinNumber: number =
    params.winNumber ?? securePickRandom(allNumbers);

  // -------------------------------------------------------------------------
  // Calculate spin animation before the transaction (non-blocking)
  // -------------------------------------------------------------------------

  const animation = await calculateSpinAnimation(decidedWinNumber);

  // -------------------------------------------------------------------------
  // Atomically settle bets and close sessions
  // -------------------------------------------------------------------------

  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: {
        sessionId: activeBetSession.id,
        winNumber: decidedWinNumber,
        winMultiplier,
      },
    });

    // Pay out all winning bets
    for (const bet of activeBetSession.gameBets) {
      if (bet.targetNumber === decidedWinNumber) {
        const payout = bet.amount.mul(winMultiplier);

        await tx.userAccount.update({
          where: { userId: bet.userId },
          data: { balance: { increment: payout } },
        });

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

    // Close the BetSession and attach the result
    await tx.betSession.update({
      where: { id: activeBetSession.id },
      data: {
        status: GameSessionStatus.COMPLETED,
        endTime: new Date(),
        resultId: gameResult.id,
      },
    });

    // Close the parent GameSession
    await tx.gameSession.update({
      where: { id: activeGameSession.id },
      data: { status: GameSessionStatus.COMPLETED },
    });

    return gameResult;
  });

  // -------------------------------------------------------------------------
  // Recycle completed GameSessions when the upcoming pool runs dry
  // -------------------------------------------------------------------------

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

  // Peek at next session for broadcast — do NOT activate it here
  const nextSession = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.UPCOMING },
    orderBy: { sessionNumber: "asc" },
    include: { multiplier: true },
  });

  // -------------------------------------------------------------------------
  // Broadcast result
  // -------------------------------------------------------------------------

  const payload = {
    completedSession: {
      id: activeBetSession.id,
      sessionNumber: activeGameSession.sessionNumber,
    },
    winNumber: decidedWinNumber,
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