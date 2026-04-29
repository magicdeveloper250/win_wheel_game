import { Router, Request, Response } from "express";
 
import { authenticate } from "../middleware/authenticate";
import { createMultiplier, deleteMultiplier, getAllMultipliers, getMultiplierById, updateMultiplier } from "../controllers/multiplier.controller";
 

const router = Router();
 
router.post(
  "/multipliers/",
  async (req: Request, res: Response) => {
    const {  label, value, color } = req.body;

    const result = await createMultiplier({  label, value, color });

    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  },
);

 
router.get(
  "/multipliers/",
  authenticate,
  async (req: Request, res: Response) => {
    

    const result = await getAllMultipliers( );

    if ("error" in result) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

 
router.get("/multipliers/:id", authenticate, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const result = await getMultiplierById(id);

  if (!result) {
    return res.status(404).json({ error: "Multipliers not found." });
  }

  if ("error" in result) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});

 
router.delete(
  "/multipliers/:id",
  authenticate,
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const result = await deleteMultiplier(id);

    if ("error" in result) {
      if (result.error === "Multipliers not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

router.patch("/multipliers/:id", authenticate, async(req, res)=>{
     const {  label, value, color } = req.body;
const id = req.params.id as string;
    const result = await updateMultiplier(id,{  label, value , color});

    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
    
})

export default router;