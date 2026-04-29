import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { getTransactions } from "../controllers/transaction.controller";

const router = Router();

router.get("/transactions", authenticate, async (req, res) => {
  try {
    const data = await getTransactions(req.query as any);
    res.json(data);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

export default router;