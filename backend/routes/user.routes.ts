import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  verifyUserPassword,
} from "../controllers/user.controller";
import { authenticate, authorizeOwner } from "../middleware/authenticate";
import {
  validate,
  createUserSchema,
  loginSchema,
  updateUserSchema,
  updatePasswordSchema,
  paginationSchema,
} from "../middleware/validate";

const router = Router();

router.post(
  "/",
  validate(createUserSchema),
  async (req: Request, res: Response) => {
    const { email, name, phone, password } = req.body;

    const result = await createUser({ email, name, phone, password });

    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  },
);

router.post(
  "/login",
  validate(loginSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const result = await verifyUserPassword(email, password);

    if ("error" in result) {
      return res.status(401).json(result);
    }

    const token = jwt.sign(
      { id: result.id, email: result.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    const refreshToken = jwt.sign(
      { id: result.id, email: result.email },
      process.env.JWT_SECRET_REFRESH!,
      { expiresIn: "30d" },
    );

    return res
      .status(200)
      .cookie("refresh_token", refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "none",
        secure: true,
      })
      .json({ ...result, token, refreshToken });
  },
);

router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token not found." });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET_REFRESH!,
    ) as { id: string; email: string };

    const user = await getUserById(decoded.id);

    if (!user || "error" in user) {
      return res.status(401).json({ error: "User not found." });
    }

    const token = jwt.sign(
      { id: decoded.id, email: decoded.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );
    const { password, ...userWithoutPassword } = user;

    return res.status(200).json({ token, ...userWithoutPassword });
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token." });
  }
});

router.post("/logout", authenticate, async (req: Request, res: Response) => {
  return res
    .status(200)
    .clearCookie("refresh_token", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    })
    .json({ message: "Logged out successfully." });
});

router.get(
  "/",
  authenticate,
  validate(paginationSchema, "query"),
  async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as {
      page: number;
      limit: number;
    };

    const result = await getAllUsers({ page, limit });

    if ("error" in result) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const result = await getUserById(id);

  if (!result) {
    return res.status(404).json({ error: "User not found." });
  }

  if ("error" in result) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});

router.patch(
  "/:id",
  authenticate,
  validate(updateUserSchema),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, phone, email, role, isActive } = req.body;
    if (req.user?.id == req.params.id && isActive==false) {
      return res
        .status(403)
        .json({
          error: "Forbidden: you can't deactivate your current account.",
        });
    }
    const result = await updateUser(id, { name, phone, email, role, isActive });

    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      if (result.error.includes("already in use")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

router.patch(
  "/:id/password",
  authenticate,
  authorizeOwner,
  validate(updatePasswordSchema),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { password } = req.body;

    const result = await updateUserPassword(id, password);

    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

router.delete(
  "/:id",
  authenticate,
  // authorizeOwner,

  async (req: Request, res: Response) => {
    if (req.user?.id == req.params.id) {
      return res
        .status(403)
        .json({ error: "Forbidden: you can't delete your own account." });
    }
    const id = req.params.id as string;

    const result = await deleteUser(id);

    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

export default router;
