import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  createDeposit,
  createWithdrawal,
  getBalance,
  getMyTransactions,
  getTransactions,
} from "../controllers/transaction.controller";

const router = Router();

router.get("/transactions", authenticate, async (req, res) => {
  try {
    const data = await getTransactions(req.query as any);
    res.json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

router.get("/transactions/me", authenticate, async (req, res) => {
  try {
    const data = await getMyTransactions({
      ...(req.query as any),
      userId: (req as any).user.id,
    });
    res.json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch your transactions." });
  }
});

router.post("/transactions/deposit", authenticate, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const provider = req.body?.provider as "MOMO" | "AIRTEL_MONEY";
    if (!["MOMO", "AIRTEL_MONEY"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider." });
    }
    const tx = await createDeposit({
      userId: (req as any).user.id,
      amount,
      provider,
    });
    res.status(201).json(tx);
  } catch (error: any) {
      console.log(error)
    const status = error?.error ? 400 : 500;
    res
      .status(status)
      .json(error?.error ? error : { error: "Deposit failed." });
  }
});
router.get("/transactions/balance", authenticate, async (req, res) => {
  try {
    const balance = await getBalance({
      userId: (req as any).user.id,
    });
    res.status(201).json(balance);
  } catch (error: any) {
  
    const status = error?.error ? 400 : 500;
    res
      .status(status)
      .json(error?.error ? error : { error: "Deposit failed." });
  }
});

router.post("/transactions/withdraw", authenticate, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const provider = req.body?.provider as "MOMO" | "AIRTEL_MONEY";
    if (!["MOMO", "AIRTEL_MONEY"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider." });
    }
    const tx = await createWithdrawal({
      userId: (req as any).user.id,
      amount,
      provider,
    });
    res.status(201).json(tx);
  } catch (error: any) {
    const status = error?.error ? 400 : 500;
    res
      .status(status)
      .json(error?.error ? error : { error: "Withdrawal failed." });
  }
});

export default router;
