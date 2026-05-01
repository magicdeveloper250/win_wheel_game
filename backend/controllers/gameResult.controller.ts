import { prisma } from "../lib/prisma";
import { GameSessionStatus } from "../generated/prisma/enums";

export const recordResult = async (params: {
  sessionId: string;
  winNumber: number;
  winMultiplier: number;
}) => {
  const session = await prisma.betSession.findUnique({
    where: { id: params.sessionId },
    include: { gameBets: true,  session: { include: { multiplier: true } } },
  });
  if (!session) throw { error: "Session not found." };
  if (session.status === GameSessionStatus.COMPLETED)
    throw { error: "Session already completed." };

  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: {
        sessionId: params.sessionId,
        winNumber: params.winNumber,
        winMultiplier: params.winMultiplier,
      },
    });

    // Pay out winners
    for (const bet of session.gameBets) {
      if (bet.targetNumber === params.winNumber) {
        const payout = bet.amount.mul(params.winMultiplier);
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

    await tx.gameSession.update({
      where: { id: params.sessionId },
      data: { status: GameSessionStatus.COMPLETED },
    });

    return gameResult;
  });

  return result;
};

export const getResults = async (params: {
  page?: number;
  limit?: number;
  sessionId?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 10;

  const where = {
    ...(params.sessionId && { sessionId: params.sessionId }),
  };

  const [data, total] = await prisma.$transaction([
    prisma.gameResult.findMany({
      where,
      include: {
        session: { include: { session: { select: { sessionNumber: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gameResult.count({ where }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};