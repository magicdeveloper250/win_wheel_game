import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { getAdminDashboard } from "../controllers/dashboard.controller";

const router = Router();

router.get("/dashboard", authenticate, async (req, res) => {
  try {
    res.json(await getAdminDashboard());
  } catch (error) {
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});

export default router;