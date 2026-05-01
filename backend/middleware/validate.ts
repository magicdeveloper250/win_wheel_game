import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

// ---------------------------------------------------------------------------
// Generic validator factory
// ---------------------------------------------------------------------------

export const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((e) => `${e.message}`)
        .join(", ");

      return res.status(400).json({ error: message });
    }
    req[source] = result.data;
    next();
  };

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address."),
  name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z
    .string()
    .regex(/^\+?[0-9]\d{6,14}$/, "Invalid phone number."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters.").optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]\d{6,14}$/, "Invalid phone number.")
      .optional(),
    email: z.string().email("Invalid email address.").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const updatePasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});