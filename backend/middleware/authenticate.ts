import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set.");
}

export interface JwtPayload {
  id: string;
  email: string;
}

// Extend Express Request so downstream handlers can access req.user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Token has expired." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
};

/**
 * Ensures the authenticated user can only act on their own resource.
 * Place after `authenticate`.
 */
export const authorizeOwner = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.id !== req.params.id) {
    return res.status(403).json({ error: "Forbidden: you can only modify your own account." });
  }
  next();
};