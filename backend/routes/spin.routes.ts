import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { getNextSession, spin } from "../controllers/spin.controller";

const router = Router();
 
router.get("/spin/next", authenticate, async (req, res) => {
  try {
    res.json(await getNextSession());
  } catch (error: any) {
    res.status(404).json(error);
  }
});

 
router.post("/spin", authenticate, async (req, res) => {
  try {
    const { winNumber } = req.body;
    if (winNumber != null && typeof winNumber !== "number") {
      return res.status(400).json({ error: "winNumber must be a number when provided." });
    }
    res.json(await spin({ winNumber }));
  } catch (error: any) {
    res.status(400).json(error);
  }
});


export default router;
