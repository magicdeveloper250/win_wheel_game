import { prisma } from "../lib/prisma";

 
export const getTargetNumberById = async (id: string) => {
  try {
    const targetNumber = await prisma.gameTargetNumber.findUnique({ where: { id } });
    return targetNumber ?? null;
  } catch {
    return { error: "An error occurred while fetching the targetNumber." };
  }
};

export const getAllTargetNumbers = async (params?: {
  page?: number;
  limit?: number;
}) => {
  try {
 

    const [targetNumbers, total] = await prisma.$transaction([
      prisma.gameTargetNumber.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.gameTargetNumber.count(),
    ]);

    return {
      data: targetNumbers,
      meta: {
        total,
        totalPages: Math.ceil(total   ),
      },
    };
  } catch {
    return { error: "An error occurred while fetching targetNumbers." };
  }
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createTargetNumber = async (params: {
  number: number;
  color:string
  
}) => {
  try {
    const existing = await prisma.gameTargetNumber.findMany({
      where: {  targetNumber:params.number },
    });

    if (existing.length > 0) {
      return { error: "A targetNumber with this number already exists." };
    }


    const targetNumber = await prisma.gameTargetNumber.create({
      data: {
         targetNumber:params.number,
         color:params.color
      },
    });

    return targetNumber;
  } catch {
    return { error: "An error occurred while creating the targetNumber." };
  }
};

 
export const updateTarget= async (
  id: string,
  params:  {
    number:number;
    color: string;
  },
) => {
  try {
    const existing = await prisma.gameTargetNumber.findUnique({
      where: { id },
    });
    if (!existing) {
      return { error: "TargetNumber not found." };
    }

    const targetNumber = await prisma.gameTargetNumber.update({
      where: { id },
      data: { targetNumber: params.number, color:params.color },
    });

    return targetNumber;
  } catch {
    return { error: "An error occurred while updating the targetNumber." };
  }
};
 

export const deleteTargetNumber = async (id: string) => {
  try {
    const existing = await prisma.gameTargetNumber.findUnique({ where: { id } });
    if (!existing) {
      return { error: "TargetNumber not found." };
    }

    await prisma.gameTargetNumber.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the targetNumber." };
  }
};

 