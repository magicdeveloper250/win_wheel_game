import { GameSessionStatus } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";

export const getGameSessions = async (params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  try {
    const page = params?.page || 1;
    const limit = params?.limit || 10;

    const where = {
      ...(params.status && { status: params.status as GameSessionStatus }),
      ...(params.search && {
        OR: [{ id: { contains: params.search } }],
      }),
      ...(params.dateFrom &&
        params.dateTo && {
          createdAt: {
            gte: new Date(params.dateFrom),
            lte: new Date(params.dateTo),
          },
        }),
    };

    const [sessions, total] = await prisma.$transaction([
      prisma.gameSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { sessionNumber: "asc" },
        include: {
          multiplier: true,
        },
      }),
      prisma.gameSession.count({ where }),
    ]);

    return {
      data: sessions,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching game sessions" };
  }
};

export const getGameSessionById = async (id: string) => {
  try {
    const session = await prisma.gameSession.findUnique({ where: { id } });
    if (!session) throw { error: "Game session not found" };
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching the game session" };
  }
};

export const createSession = async (params: {
  duration: number;
  shouldWin: boolean;
  multiplierId: string;
}) => {
  try {
    const maxSessionNumber = await prisma.gameSession.aggregate({
      _max: { sessionNumber: true },
    });
    const nextSessionNumber = (maxSessionNumber._max.sessionNumber || 0) + 1;

    const session = await prisma.gameSession.create({
      data: {
        duration: params.duration,
        shouldWin: params.shouldWin,
        multiplierId: params.multiplierId,
        sessionNumber: nextSessionNumber,
      },
    });

    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while creating the session." };
  }
};

export const updateSession = async (
  id: string,
  params: {
    duration: number;
    shouldWin: boolean;
    multiplierId: string;
    multiplier: any;
  },
) => {
  try {
    const { multiplier: _, ...updateData } = params;
    const session = await prisma.gameSession.update({
      where: { id },
      data: updateData,
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while updating the session." };
  }
};

export const deleteSession = async (id: string) => {
  try {
    await prisma.gameSession.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while deleting the session." };
  }
};

export const reorderSessions = async (
  sessionOrders: { id: string; sessionNumber: number }[],
) => {
  if (!sessionOrders || sessionOrders.length === 0) {
    throw { error: "sessionOrders array is required and cannot be empty" };
  }

  for (const order of sessionOrders) {
    if (!order.id || typeof order.sessionNumber !== "number") {
      throw { error: "Each order must have an id and a numeric sessionNumber" };
    }
  }

  try {
    const TEMP_HOLDER = -999999;

    const results = await prisma.$transaction(
      async (tx) => {
        const updated = [];

        for (const order of sessionOrders) {
          // Check if the target sessionNumber is already occupied by another session
          const occupyingSession = await tx.gameSession.findFirst({
            where: {
              sessionNumber: order.sessionNumber,
              id: { not: order.id },
            },
          });

          if (occupyingSession) {
            // Temporarily move the occupying session out of the way
            await tx.gameSession.update({
              where: { id: occupyingSession.id },
              data: { sessionNumber: TEMP_HOLDER },
            });
          }

          // Move the current session to its target position
          const updatedSession = await tx.gameSession.update({
            where: { id: order.id },
            data: { sessionNumber: order.sessionNumber },
          });

          updated.push(updatedSession);

          if (occupyingSession) {
            // Find where the displaced session should ultimately go
            const newHome = sessionOrders.find(
              (o) => o.id === occupyingSession.id,
            );
            if (newHome) {
              await tx.gameSession.update({
                where: { id: occupyingSession.id },
                data: { sessionNumber: newHome.sessionNumber },
              });
            }
          }
        }

        return updated;
      },
      { maxWait: 60000, timeout: 60000 },
    );

    return { success: true, data: results };
  } catch (error) {
    console.error("Reorder sessions error:", error);
    throw { error: "Failed to reorder sessions" };
  }
};

export const getActiveSession = async (userId: string) => {
  try {
    const active = await prisma.betSession.findFirst({
      where: { status: GameSessionStatus.ACTIVE },
      include: { session: { include: { multiplier: true } } },
    });
    if (!active) return null;

    const [myBets, myTicketBets] = await Promise.all([
      prisma.gameBet.findMany({
        where: { sessionId: active.id, userId },
      }),
      prisma.gameBet.findMany({
        where: {
          sessionId: active.id,
          ticket: { userId },   
        },
      }),
    ]);

    const allBets = [...myBets, ...myTicketBets];

    return { ...active, betted: allBets.length > 0, myBets: allBets };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching the active session." };
  }
};