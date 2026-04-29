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
    ...(params.dateFrom && params.dateTo && {
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