import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getUserByEmail = async (email: string) => {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ?? null;
  } catch {
    return { error: "An error occurred while fetching the user." };
  }
};

export const getUserById = async (id: string) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    const userAccount= await prisma.userAccount.findFirst({where:{userId:id}});
    return user ? {...user , balance: userAccount?.balance ?? 0} : null;
  } catch {
    return { error: "An error occurred while fetching the user." };
  }
};

export const getAllUsers = async (params?: {
  page?: number;
  limit?: number;
}) => {
  try {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        omit: { password: true },
      }),
      prisma.user.count(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch {
    return { error: "An error occurred while fetching users." };
  }
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createUser = async (params: {
  email: string;
  name: string;
  phone: string;
  password: string;
}) => {
  try {
    const existing = await prisma.user.findFirst({
      where: {OR: [{email: params.email},{ phone:params.phone}]},
    });

    if (existing) {
      return { error: "A user with this email/phone  already exists." };
    }

    const hashedPassword = await bcrypt.hash(params.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        phone: params.phone,
        password: hashedPassword,
        role: "USER",
        createdAt: new Date(),
      },
      omit: { password: true },
    });

    return user;
  } catch(e) {
    
    return { error: "An error occurred while creating the user." + e };
  }
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateUser = async (
  id: string,
  params: Partial<{
    name: string;
    phone: string;
    email: string;
  }>,
) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }

    // If email is being changed, ensure it isn't already taken
    if (params.email && params.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: params.email },
      });
      if (emailTaken) {
        return { error: "Email is already in use by another account." };
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: { ...params, updatedAt: new Date() },
      omit: { password: true },
    });

    return user;
  } catch {
    return { error: "An error occurred while updating the user." };
  }
};

export const updateUserPassword = async (
  id: string,
  newPassword: string,
) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword, updatedAt: new Date() },
    });

    return { success: true };
  } catch {
    return { error: "An error occurred while updating the password." };
  }
};

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export const deleteUser = async (id: string) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }

    await prisma.user.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the user." };
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the user with the password field included.
 * Use only in auth flows (e.g. comparing hashed passwords).
 */
export const getUserWithPasswordByEmail = async (email: string) => {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ?? null;
  } catch {
    return { error: "An error occurred while fetching the user." };
  }
};

/**
 * Verifies a plain-text password against the stored hash.
 * Returns the user (without password) on success, or an error object.
 */
export const verifyUserPassword = async (
  email: string,
  plainPassword: string,
) => {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { error: "Invalid email or password." };
    }

    const isValid = await bcrypt.compare(plainPassword, user.password);
    if (!isValid) {
      return { error: "Invalid email or password." };
    }
    const userAccount= await prisma.userAccount.findFirst({where:{userId:user.id}});

    const { password: _, ...userWithoutPassword } = user;
    return { ...userWithoutPassword , user_id:userWithoutPassword.id, balance: userAccount?.balance ?? 0 };
  } catch {
    return { error: "An error occurred while verifying the password." };
  }
};