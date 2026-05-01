import { prisma } from "../lib/prisma";
import { GameSessionStatus } from "../generated/prisma/enums";

export const getAdminDashboard = async () => {
  const [
    totalUsers,
    totalSessions,
    activeSessions,
    upcomingSessions,
    totalBets,
    revenueAgg,
    payoutAgg,
    recentTransactions,
    recentBets,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.gameSession.count(),
    prisma.gameSession.count({ where: { status: GameSessionStatus.ACTIVE } }),
    prisma.gameSession.count({ where: { status: GameSessionStatus.UPCOMING } }),
    prisma.gameBet.count(),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "BET" },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "WIN_PAYOUT" },
    }),
    prisma.transaction.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.gameBet.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        session: { include: { session: { select: { sessionNumber: true } } } },
      },
    }),
  ]);

  const totalRevenue = revenueAgg._sum.amount ?? 0;
  const totalPayouts = payoutAgg._sum.amount ?? 0;

  return {
    stats: {
      totalUsers,
      totalSessions,
      activeSessions,
      upcomingSessions,
      totalBets,
      totalRevenue,
      totalPayouts,
      netProfit: Number(totalRevenue) - Number(totalPayouts),
    },
    recentTransactions,
    recentBets,
  };
};