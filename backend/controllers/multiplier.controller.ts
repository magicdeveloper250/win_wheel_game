import { prisma } from "../lib/prisma";

export const getMultiplierById = async (id: string) => {
  try {
    const multiplier = await prisma.gameWinMultiplier.findUnique({
      where: { id },
    });
    return multiplier ?? null;
  } catch {
    return { error: "An error occurred while fetching the multiplier." };
  }
};

export const getAllMultipliers = async () => {
  try {
    const [multipliers, total] = await prisma.$transaction([
      prisma.gameWinMultiplier.findMany({
        orderBy: { multiplierLetter: "asc" },
      }),
      prisma.gameWinMultiplier.count(),
    ]);

    return {
      data: multipliers,
    };
  } catch {
    return { error: "An error occurred while fetching multipliers." };
  }
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createMultiplier = async (params: {
  label: string;
  value: number;
  color:string
}) => {
  try {
    const existing = await prisma.gameWinMultiplier.findMany({
      where: {
        AND: [
          { multiplierLetter: params.label },
          
        ],
      },
    });

    if (existing.length > 0) {
      return { error: "A multiplier already exists." };
    }

    const multiplier = await prisma.gameWinMultiplier.create({
      data: {
        multiplierLetter: params.label,
        winMultiplier: params.value,
        color:params.color
      },
    });

    return multiplier;
  } catch(e) {
    return { error: "An error occurred while creating the multiplier." + e };
  }
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateMultiplier = async (
  id: string,
  params: Partial<{
    label: string;
    value: number;
    multiplierNumber: number;
    color:string
  }>,
) => {
  try {
    const existing = await prisma.gameWinMultiplier.findUnique({
      where: { id },
    });
    if (!existing) {
      return { error: "Multiplier not found." };
    }
     

    const multiplier = await prisma.gameWinMultiplier.update({
      where: { id },
      data: { multiplierLetter: params.label, winMultiplier: params.value, color:params.color },
    });

    return multiplier;
  } catch {
    return { error: "An error occurred while updating the multiplier." };
  }
};

 
 
export const deleteMultiplier = async (id: string) => {
  try {
    const existing = await prisma.gameWinMultiplier.findUnique({
      where: { id },
    });
    if (!existing) {
      return { error: "Multiplier not found." };
    }

    await prisma.gameWinMultiplier.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the multiplier." };
  }
};
