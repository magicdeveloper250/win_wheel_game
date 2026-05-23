import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { placeBet, getUserBets, getLatestBetResults, placeTicketBet, payTicket } from "../controllers/bet.controller";
import path from "path";
import express from "express";
import { generateBetSlip } from "../utils/generateSlip";
import { prisma } from "../lib/prisma";

const SLIPS_DIR = path.join(process.cwd(), "public", "slips");
const PUBLIC_BASE = process.env.PUBLIC_URL ?? "http://localhost:3000";

const router = Router();

router.use("/slips", express.static(SLIPS_DIR));

router.get("/verify/:ticketId", async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId },
      select: {
        id: true,
        name: true,
        phone: true,
        amount: true,
        paid: true,
        won: true,
        createdAt: true,
        gameBets: {
          select: {
            targetNumber: true,
            multiplierNumber: true,
            amount: true,
            session: {
              select: {
                session: {
                  select: { sessionNumber: true },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    return res.json({
      id: ticket.id,
      name: ticket.name,
      phone: ticket.phone,
      amount: ticket.amount,
      paid: ticket.paid,
      won: ticket.won,
      createdAt: ticket.createdAt,
      sessionNumber: ticket.gameBets[0]?.session?.session?.sessionNumber ?? null,
      bets: ticket.gameBets.map((b) => ({
        targetNumber: b.targetNumber,
        multiplierNumber: b.multiplierNumber,
        amount: b.amount,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to verify ticket." });
  }
});

router.post("/bets", authenticate, async (req, res) => {
  try {
    const { sessionId, targetNumbers, amount } = req.body;
    if (!sessionId || targetNumbers == null || !amount) {
      return res.status(400).json({ error: "sessionId, targetNumber, and amount are required." });
    }
    const result = await placeBet({
      userId: (req as any).user.id,
      sessionId,
      targetNumbers,
      amount,
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json(error);
  }
});

router.post("/bets/ticket", authenticate, async (req, res) => {
  try {
    const { sessionId, targetNumbers, amount, ticket } = req.body;
    if (!sessionId || targetNumbers == null || !amount) {
      return res.status(400).json({ error: "sessionId, targetNumber, and amount are required." });
    }
    const result = await placeTicketBet({
      userId: (req as any).user.id,
      sessionId,
      targetNumbers,
      amount,
      ticket,
    });

    const slipData = {
      ticketRef: result.ticket.id,
      sessionNumber: result.session.session.sessionNumber,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      time: new Date().toLocaleTimeString("en-GB"),
      holderName: ticket.name,
      holderPhone: ticket.phone,
      bets: targetNumbers.map((sel: string) => ({
        type: isNaN(Number(sel)) ? "Letter" : "Number",
        selection: sel,
        stake: amount,
        odds: result.bet.find((b: any) => b.targetNumber === sel)?.multiplierNumber ?? 1,
      })),
      taxPct: 0.15,
      company: "WinWheel",
      location: "Kigali",
      qrUrl: `${PUBLIC_BASE}/verify/${result.ticket.id}`,
    };

    const pdfPath = await generateBetSlip(slipData, SLIPS_DIR);
    const pdfFile = path.basename(pdfPath);
    const slipUrl = `${PUBLIC_BASE}/slips/${pdfFile}`;

    return res.json({ ...result, slipUrl });
  } catch (error: any) {
    res.status(400).json(error);
  }
});

router.patch("/bets/ticket/pay/:id", authenticate, async (req, res) => {
  try {
    const result = await payTicket({ ticketId: req.params.id as string });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json(error);
  }
});

router.get("/bets/me", authenticate, async (req, res) => {
  try {
    res.json(await getUserBets({ userId: (req as any).user.id, ...(req.query as any) }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bets." });
  }
});

router.get("/bets/latest", authenticate, async (req, res) => {
  try {
    const latestBet = await getLatestBetResults();
    res.json(latestBet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch latest bet result." });
  }
});

export default router;