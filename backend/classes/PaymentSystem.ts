 
import axios, { AxiosInstance } from "axios";
import {
  ApiResponse,
  CallbackPayload,
  HttpMethod,
  PaymentData,
  PaymentMethod,
  PaymentSystemConfig,
} from "../types/payment";
import { randomInt } from "crypto";
import { format } from "date-fns";
import { generateSnowflakeIdString } from "../lib/snowFlake";
 
export function loadConfigFromEnv(): PaymentSystemConfig {
  const apiUrl = process.env.PAYMENT_API_URL;
  const cardRedirectUrl = process.env.PAYMENT_CARD_REDIRECT_URL;
  const appKey = process.env.PAYMENT_APP_KEY;
  const secretKey = process.env.PAYMENT_SECRET_KEY;

  if (!apiUrl || !cardRedirectUrl || !appKey || !secretKey) {
    throw new Error(
      "Missing required env vars. Check your .env file against .env.example.\n" +
        "Required: PAYMENT_API_URL, PAYMENT_CARD_REDIRECT_URL, PAYMENT_APP_KEY, PAYMENT_SECRET_KEY"
    );
  }

  return {
    apiUrl,
    cardRedirectUrl,
    appKey,
    secretKey,
    timeoutMs: process.env.PAYMENT_REQUEST_TIMEOUT_MS
      ? parseInt(process.env.PAYMENT_REQUEST_TIMEOUT_MS, 10)
      : 15_000,
  };
}


export class PaymentSystem {
  public readonly cardRedirectUrl: string;

  private readonly config: PaymentSystemConfig;
  private readonly http: AxiosInstance;

  constructor(config: PaymentSystemConfig) {
    this.config = config;
    this.cardRedirectUrl = config.cardRedirectUrl;

    const authToken = Buffer.from(
      `${config.appKey}:${config.secretKey}`
    ).toString("base64");

    this.http = axios.create({
      baseURL: config.apiUrl,
      timeout: config.timeoutMs ?? 15_000,
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
      },
    });
  }

 
  async makeRequest<T = PaymentData>(
    method: HttpMethod,
    data: Record<string, unknown> = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response =
        method === "GET"
          ? await this.http.get<ApiResponse<T>>("", { params: data })
          : await this.http.request<ApiResponse<T>>({
              method,
              data,
            });

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        return {
          status: false,
          message: error.message,
          data: error.response?.data,
        };
      }
      return {
        status: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  
async initiatePayment(userInfo: {
  email: string;
  name: string;
  phone: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  servicePaid?: string;
  callbackUrl?: string;
}): Promise<{
  success: boolean;
  referenceId: string | null;
  transactionId: string | null;
  status: string;
  message: string;
  raw?: unknown;
}> {
  const referenceId =  generateSnowflakeIdString();
  const payload = {
    email: userInfo.email,
    name: userInfo.name,
    payer_phone: userInfo.phone,
    amount: userInfo.amount,
    payment_method: userInfo.paymentMethod ?? "MTN_MOMO_RWA",
    service_paid: userInfo.servicePaid ?? "payment",
    reference_id: referenceId,
    callback_url: userInfo.callbackUrl ?? process.env.PAYMENT_CALLBACK_URL ?? "",
    action: "pay",
  };

  const response = await this.makeRequest("POST", payload);

  const returnedRef =
    (response.data as Record<string, unknown>)?.["reference_id"] as string ??
    (response.data as Record<string, unknown>)?.["refid"] as string ??
    (response as Record<string, unknown>)?.["reference_id"] as string ??
    referenceId;  

  return {
    success: response.status === true,
    referenceId: returnedRef ?? null,
    transactionId:
      ((response.data as Record<string, unknown>)?.["transaction_id"] as string) ?? null,
    status:
      ((response.data as Record<string, unknown>)?.["status"] as string) ?? "PENDING",
    message: response.message ?? (response.status ? "Payment initiated" : "Payment failed"),
    raw: response,
  };
}
  async pay(payload: Record<string, unknown>): Promise<ApiResponse<PaymentData>> {
    return this.makeRequest("POST", { ...payload, action: "pay" });
  }

  async getPayment(referenceId: string): Promise<ApiResponse<PaymentData>> {
    return this.makeRequest("GET", { reference_id: referenceId });
  }

 
  receiveCallback(raw: unknown): ApiResponse {
    if (!isValidCallback(raw)) {
      return { status: false, message: "Invalid callback payload" };
    }

    const { reference_id, transaction_id, status, action } = raw;

    console.info("[PaymentSystem] Callback received", {
      reference_id,
      transaction_id,
      status,
      action,
    });

    return {
      status: true,
      message: "Callback processed successfully",
      data: { reference_id, transaction_id, status, action },
    };
  }
}
 
function isValidCallback(raw: unknown): raw is CallbackPayload {
  if (typeof raw !== "object" || raw === null) return false;
  const cb = raw as Record<string, unknown>;
  return (
    typeof cb["reference_id"] === "string" &&
    typeof cb["transaction_id"] === "string" &&
    typeof cb["status"] === "string" &&
    typeof cb["action"] === "string"
  );
}