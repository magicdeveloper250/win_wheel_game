 
import { Router, Request, Response } from "express";
import { PaymentSystem, loadConfigFromEnv } from "../classes/PaymentSystem";

const paymentSystem = new PaymentSystem(loadConfigFromEnv());

export const callbackRouter = Router();

callbackRouter.post("/payment", (req: Request, res: Response) => {
  const callbackData: unknown = req.body;

  const response = paymentSystem.receiveCallback(callbackData);

  if (!response.status) {
    res.status(400).json(response);
    return;
  }

  res.status(200).json(response);
});