import { prisma } from "../lib/prisma";

export const getTransactions = async (params: {
  page?: number;
  limit?: number;
  userId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 10;

  const where = {
    ...(params.userId && { userId: params.userId }),
    ...(params.type && { type: params.type }),
    ...(params.dateFrom &&
      params.dateTo && {
        createdAt: {
          gte: new Date(params.dateFrom),
          lte: new Date(params.dateTo),
        },
      }),
  };

  const [data, total, aggregates] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * Number(limit),
      take: Number(limit),
    }),

    prisma.transaction.count({ where }),

    prisma.transaction.aggregate({
      where,
      _sum: {
        amount: true,
      },
    }),
  ]);

  const [betTotals, payoutTotals] = await prisma.$transaction([
    prisma.transaction.aggregate({
      where: { ...where, type: "BET" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: "PAYOUT" },
      _sum: { amount: true },
    }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / Number(limit)),
    },
    totals: {
      overallAmount: aggregates._sum.amount || 0,
      totalBets: betTotals._sum.amount || 0,
      totalPayouts: payoutTotals._sum.amount || 0,
    },
  };
};

export const getMyTransactions = async (params: {
  userId: string;
  page?: number;
  limit?: number;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}) =>
  getTransactions({
    ...params,
    userId: params.userId,
  });

export const createDeposit = async (params: {
  userId: string;
  amount: number;
  provider: "MOMO" | "AIRTEL_MONEY";
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }

  return prisma.$transaction(async (tx) => {
    // Lock the row with findFirst + update, or create if not exists
    // First ensure the account exists
    await tx.userAccount.upsert({
      where: { userId: params.userId },
      update: {},                          // no-op if exists
      create: { userId: params.userId, balance: 0 },
    });

    // Now safely update — row is guaranteed to exist
    const updatedAccount = await tx.userAccount.update({
      where: { userId: params.userId },
      data: {
        balance: {
          increment: params.amount,        // atomic increment, no race condition
        },
      },
      select: { balance: true },
    });

    if (Number(updatedAccount.balance) > 1_000_000) {
      throw { error: "Deposit would exceed maximum balance limit of 1,000,000." };
    }

    const txRecord = await tx.transaction.create({
      data: {
        userId: params.userId,
        amount: params.amount,
        type: "DEPOSIT",
        tax: 0,
      },
    });

    return {
      ...txRecord,
      balance: updatedAccount.balance,
      meta: { provider: params.provider },
    };
  });
};

export const createWithdrawal = async (params: {
  userId: string;
  amount: number;
  provider: "MOMO" | "AIRTEL_MONEY";
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }

  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true },
  });
  
  const balance = Number(userBalance?.balance ?? 0);
  if (balance < params.amount) {
    throw { error: "Insufficient balance for withdrawal." };
  }

  const updatedBalance = balance - params.amount;
  await prisma.userAccount.upsert({
    where: { userId: params.userId },
    update: { balance: updatedBalance },
    create: {
      userId: params.userId,
      balance: updatedBalance,
    },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId: params.userId,
      amount: -Math.abs(params.amount),
      type: "WITHDRAWAL",
      tax: 0,
    },
  });

  return {
    ...tx,
    balance: updatedBalance,
    meta: { provider: params.provider },
  };
};


export const getBalance= async(params:{userId:string})=>{
  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true },
  });
  return Number(userBalance?.balance ?? 0);
}