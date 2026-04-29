import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { placeBet, getUserBets } from "../controllers/bet.controller";

const router = Router();

router.post("/bets", authenticate, async (req, res) => {
  try {
    const { sessionId, targetNumber, amount } = req.body;
    if (!sessionId || targetNumber == null || !amount) {
      return res.status(400).json({ error: "sessionId, targetNumber, and amount are required." });
    }
    const result = await placeBet({
      userId: (req as any).user.id,
      sessionId,
      targetNumber,
      amount,
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json(error);
  }
});

router.get("/bets/me", authenticate, async (req, res) => {
  try {
    res.json(
      await getUserBets({
        userId: (req as any).user.id,
        ...(req.query as any),
      })
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bets." });
  }
});

export default router;