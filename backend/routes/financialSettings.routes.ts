import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { getFinancialSettings, upsertFinancialSettings } from "../controllers/financialSetting.controller";
 

const router = Router();

router.get("/settings/financial", authenticate, async (req, res) => {
  try {
    res.json(await getFinancialSettings());
  } catch (error: any) {
    console.log(error)
    res.status(404).json(error);
  }
});

router.put("/settings/financial", authenticate, async (req, res) => {
  try {
    const { minBetAmount, maxBetAmount, taxPercentage, houseEdgePercentage } = req.body;
    if (
      minBetAmount == null ||
      maxBetAmount == null ||
      taxPercentage == null ||
      houseEdgePercentage == null
    ) {
      return res.status(400).json({ error: "All financial fields are required." });
    }
    res.json(await upsertFinancialSettings(req.body));
  } catch (error) {
    res.status(500).json({ error: "Failed to save financial settings." });
  }
});

export default router;