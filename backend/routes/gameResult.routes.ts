import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { recordResult, getResults } from "../controllers/gameResult.controller";

const router = Router();

router.post("/results", authenticate, async (req, res) => {
  try {
    const { sessionId, winNumber, winMultiplier } = req.body;
    if (!sessionId || winNumber == null || winMultiplier == null) {
      return res.status(400).json({ error: "sessionId, winNumber, and winMultiplier are required." });
    }
    res.status(201).json(await recordResult({ sessionId, winNumber, winMultiplier }));
  } catch (error: any) {
    res.status(400).json(error);
  }
});

router.get("/results", authenticate, async (req, res) => {
  try {
    res.json(await getResults(req.query as any));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch results." });
  }
});

export default router;