 
import "dotenv/config";
import { loadConfigFromEnv, PaymentSystem } from "../classes/PaymentSystem";
import { PaymentRequest } from "../types/payment";

async function main() {
  const config = loadConfigFromEnv();
  const paymentSystem = new PaymentSystem(config);

  const callbackUrl =
    process.env.PAYMENT_CALLBACK_URL ??
    "https://pay.lmbtech.rw/pay/test/callback.php";

  const referenceId = `REF-IN-${formatDate()}-${randomInt(1000, 9999)}`;

  const payData: PaymentRequest = {
    email: "danieltn889@gmail.com",
    name: "Daniel Payment",
    payment_method: "MTN_MOMO_RWA",
    amount: 150,
    payer_phone: "+250785085214",
    service_paid: "test_pay",
    reference_id: referenceId,
    callback_url: callbackUrl,
    action: "pay",
  };

 
  const payResponse = await paymentSystem.makeRequest("POST", payData as unknown as Record<string, unknown>);

  let capturedId: string | null = null;

  if (typeof payResponse.data === "object" && payResponse.data !== null) {
    const d = payResponse.data as Record<string, unknown>;
    capturedId =
      (d["reference_id"] as string) ??
      (d["refid"] as string) ??
      null;
  }
  if (!capturedId && typeof (payResponse as Record<string, unknown>)["reference_id"] === "string") {
    capturedId = (payResponse as Record<string, unknown>)["reference_id"] as string;
  }
  if (!capturedId) {
    capturedId = referenceId;
    console.warn(
      `⚠️  Warning: API didn't return reference_id. Using the ID we sent: ${capturedId}`
    );
  }

  console.log(`\nCaptured ID: ${capturedId}`);
  console.log("\n[2] Retrieving payment status...");
  const getResponse = await paymentSystem.getPayment(capturedId);
  console.log(JSON.stringify(getResponse, null, 2));

  console.log("\n============================================");
  console.log("🏁 TEST SUITE COMPLETED");
  console.log("============================================\n");
}
 
function formatDate(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});