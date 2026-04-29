import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "../lib/prisma";

export const placeBet = async (params: {
  userId: string;
  sessionId: string;
  targetNumber: number;
  amount: number;
}) => {
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!settings) throw { error: "Financial settings not configured." };

  const amount = new Decimal(params.amount);
  if (amount.lessThan(settings.minBetAmount))
    throw { error: `Minimum bet amount is ${settings.minBetAmount}.` };
  if (amount.greaterThan(settings.maxBetAmount))
    throw { error: `Maximum bet amount is ${settings.maxBetAmount}.` };

  const session = await prisma.gameSession.findUnique({
    where: { id: params.sessionId },
  });
  if (!session) throw { error: "Session not found." };
  if (session.status !== "UPCOMING" && session.status !== "ACTIVE")
    throw { error: "Session is not accepting bets." };

 

  const tax = amount.mul(settings.taxPercentage).div(100);

  const [bet, transaction] = await prisma.$transaction([
    prisma.gameBet.create({
      data: {
        userId: params.userId,
        sessionId: params.sessionId,
        targetNumber: params.targetNumber,
        amount,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: params.userId,
        amount,
        type: "BET",
        tax,
      },
    }),
  ]);

  return { bet, transaction };
};

export const getUserBets = async (params: {
  userId: string;
  page?: number;
  limit?: number;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 10;

  const [data, total] = await prisma.$transaction([
    prisma.gameBet.findMany({
      where: { userId: params.userId },
      include: {
        session: { select: { id: true, sessionNumber: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gameBet.count({ where: { userId: params.userId } }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};