 
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type PaymentMethod =
  | "MTN_MOMO_RWA"
  | "AIRTEL_MONEY_RWA"
  | "CARD"; // extend as needed

export type PaymentAction = "pay" | "payout" | "refund";

export type PaymentStatus =
  | "PENDING"
  | "SUCCESSFUL"
  | "FAILED"
  | "CANCELLED";

 
export interface PaymentRequest {
  email: string;
  name: string;
  payment_method: PaymentMethod;
  amount: number;
  payer_phone: string;
  service_paid: string;
  reference_id: string;
  callback_url: string;
  action: PaymentAction;
}

export interface GetPaymentRequest {
  reference_id: string;
}

 
export interface ApiResponse<T = unknown> {
  status: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown; 
}

export interface PaymentData {
  reference_id?: string;
  transaction_id?: string;
  status?: PaymentStatus;
  amount?: number;
  [key: string]: unknown;
}

 
export interface CallbackPayload {
  reference_id: string;
  transaction_id: string;
  status: PaymentStatus;
  action: PaymentAction;
  [key: string]: unknown;
}
 
export interface PaymentSystemConfig {
  apiUrl: string;
  cardRedirectUrl: string;
  appKey: string;
  secretKey: string;
  timeoutMs?: number;
}