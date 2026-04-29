import { prisma } from "../lib/prisma";

export const getFinancialSettings = async () => {
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!settings) throw { error: "No financial settings configured." };
  return settings;
};

export const upsertFinancialSettings = async (params: {
  minBetAmount: number;
  maxBetAmount: number;
  taxPercentage: number;
  houseEdgePercentage: number;
}) => {
  const existing = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.gameFinancialSetting.update({
      where: { id: existing.id },
      data: params,
    });
  }

  return prisma.gameFinancialSetting.create({ data: params });
};