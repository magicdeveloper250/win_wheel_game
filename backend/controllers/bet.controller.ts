import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "../lib/prisma";
import { emitGameEvent, GameEventType } from "../ws/gameEvents";
import { GameSessionStatus } from "../generated/prisma/enums";

export const placeBet = async (params: {
  userId: string;
  sessionId: string;
  targetNumbers: number[];
  amount: number;
}) => {
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!settings) throw { error: "Financial settings not configured." };

  const amount = new Decimal(params.amount).mul(params.targetNumbers.length);
  if (amount.lessThan(settings.minBetAmount))
    throw { error: `Minimum bet amount is ${settings.minBetAmount}.` };
  if (amount.greaterThan(settings.maxBetAmount))
    throw { error: `Maximum bet amount is ${settings.maxBetAmount}.` };

  const session = await prisma.betSession.findUnique({
    where: { id: params.sessionId },
    include: { session: { include: { multiplier: true } } },
  });
  if (!session) throw { error: "Session not found." };
  if (session.status !== GameSessionStatus.ACTIVE)
    throw { error: "Session is not accepting bets." };

  const tax = amount.mul(settings.taxPercentage);

  const { bet, transaction, balance } = await prisma.$transaction(
    async (tx) => {
      const available = await tx.userAccount.findFirst({
        where: { userId: params.userId },
        select: { balance: true },
      });
      const balance = new Decimal(available?.balance ?? 0);
      if (balance.lessThan(amount.add(tax))) {
        throw { error: "Insufficient balance to place this bet." };
      }

      for(const targetNumber of params.targetNumbers) {
        await tx.gameBet.create({
          data: {
            userId: params.userId,
            sessionId: params.sessionId,
            targetNumber,
            amount: new Decimal(params.amount),
          },
        });
      }

       const bet = await tx.gameBet.createMany({
        data: params.targetNumbers.map((targetNumber) => ({
          userId: params.userId,
          sessionId: params.sessionId,
          targetNumber,
          amount: new Decimal(params.amount),
        })),
      });

       await tx.userAccount.update({
        where: { userId: params.userId },
        data: {
          balance: balance.sub(amount.add(tax)).toNumber(),
        },
      });
      
      await tx.userAccount.update({
        where: { userId: params.userId },
        data: {
          balance: balance.sub(amount.add(tax)).toNumber(),
        },
      });
      const transaction = await tx.transaction.create({
        data: {
          userId: params.userId,
          amount,
          type: "BET",
          tax,
        },
      });
      await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: tax.negated(),
          type: "TAX",
          tax: 0,
        },
      });
      const updatedBalance = balance.sub(amount.add(tax)).toNumber();
      return { bet, transaction, balance: updatedBalance };
    },
  );

  await emitGameEvent(GameEventType.BET_PLACED, {
    userId: params.userId,
    sessionId: session.id,
    sessionNumber: session.session.sessionNumber,
    targetNumber: params.targetNumbers,
    amount: amount.toNumber(),
    totalBetsInSession: await prisma.gameBet.count({
      where: { sessionId: session.id },
    }),
  });

  return { bet, transaction, balance };
};

export const getUserBets = async (params: {
  userId: string;
  page?: number;
  limit?: number;
}) => {
  const page = params.page || 1;
  const limit = Number(params.limit) || 10;

  const [data, total] = await prisma.$transaction([
    prisma.gameBet.findMany({
      where: { userId: params.userId },
      include: {
        session: {
          include: {
            session: {
              select: { id: true, sessionNumber: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gameBet.count({ where: { userId: params.userId } }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};


export const getLatestBetResults = async ( ) => {
  const latestBet = await prisma.gameResult.findMany({
    orderBy: { createdAt: "desc" },
    take:15
  });
  return latestBet;
};