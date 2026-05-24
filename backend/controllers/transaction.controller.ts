import { loadConfigFromEnv, PaymentSystem } from "../classes/PaymentSystem";
import { prisma } from "../lib/prisma";
import { parseRwandaPhone } from "../validation/validatePhone";

export const getTransactions = async (params: {
  page?: number;
  limit?: number;
  userId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 10;

  const where = {
    ...(params.userId && { userId: params.userId }),
    ...(params.type && { type: params.type }),
    ...(params.dateFrom &&
      params.dateTo && {
        createdAt: {
          gte: new Date(params.dateFrom),
          lte: new Date(params.dateTo),
        },
      }),
  };

  const [data, total, aggregates] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * Number(limit),
      take: Number(limit),
    }),

    prisma.transaction.count({ where }),

    prisma.transaction.aggregate({
      where,
      _sum: {
        amount: true,
      },
    }),
  ]);

  const [betTotals, payoutTotals] = await prisma.$transaction([
    prisma.transaction.aggregate({
      where: { ...where, type: "BET" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: "PAYOUT" },
      _sum: { amount: true },
    }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / Number(limit)),
    },
    totals: {
      overallAmount: aggregates._sum.amount || 0,
      totalBets: betTotals._sum.amount || 0,
      totalPayouts: payoutTotals._sum.amount || 0,
    },
  };
};

export const getMyTransactions = async (params: {
  userId: string;
  page?: number;
  limit?: number;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}) =>
  getTransactions({
    ...params,
    userId: params.userId,
  });

export const createDeposit = async (params: {
  userId: string;
  amount: number;
  provider: "MOMO" | "AIRTEL_MONEY";
  phoneNumber?: string;
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }

  if (params.amount > 1_000_000) {
    throw {
      error: "Deposit would exceed maximum balance limit of 1,000,000.",
    };
  }

  // ── 1. Fetch user BEFORE opening a DB transaction ──────────────────────────
  const user = await prisma.user.findFirst({ where: { id: params.userId } });
  if (!user) {
    throw { error: "The Deposit user not found in the system" };
  }
  if (!user.phone) {
    throw { error: "User phone number is required to proceed the operation" };
  }

  // Resolve the phone to charge: prefer the caller-supplied number, fall back
  // to the one stored on the user record.
  const rawPhone =
    params.phoneNumber && params.phoneNumber.length > 5
      ? params.phoneNumber
      : user.phone;
  const paymentPhone = parseRwandaPhone(rawPhone);

  // ── 2. Initiate payment OUTSIDE the DB transaction ─────────────────────────
  // Keeping an external HTTP call inside prisma.$transaction holds the DB
  // connection open for the full MoMo round-trip, which causes timeouts on
  // hosted environments like Render.
  const ps = new PaymentSystem(loadConfigFromEnv());
  const result = await ps.initiatePayment({
    email: user.email,
    name: user.name,
    phone: paymentPhone,
    amount: params.amount,
    paymentMethod:
      params.provider === "MOMO" ? "MTN_MOMO_RWA" : "AIRTEL_MONEY_RWA",
    servicePaid: "payment",
  });

  if (!result.success) {
    throw { error: result.message ?? "Payment initiation failed." };
  }

  const transactionId = result.transactionId;
  const referenceId = result.referenceId;

  // ── 3. Record the deposit in a short DB transaction ────────────────────────
  return prisma.$transaction(
    async (tx) => {
      // Single upsert: increment on existing row, seed with the deposit amount
      // on first creation. Avoids the P2025 "record not found" error that
      // occurred when the separate update ran before the upsert's create
      // was visible within the same transaction.
      const updatedAccount = await tx.userAccount.upsert({
        where: { userId: params.userId },
        update: { balance: { increment: params.amount } },
        create: { userId: params.userId, balance: params.amount },
        select: { balance: true },
      });

      if (Number(updatedAccount.balance) > 1_000_000) {
        throw {
          error: "Deposit would exceed maximum balance limit of 1,000,000.",
        };
      }

      const txRecord = await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: params.amount,
          exTransactionId: transactionId,
          reference_id: referenceId,
          type: "DEPOSIT",
          tax: 0,
        },
      });

      return {
        ...txRecord,
        balance: updatedAccount.balance,
        meta: { provider: params.provider },
      };
    },
    { timeout: 15_000, maxWait: 15_000 },
  );
};

export const createWithdrawal = async (params: {
  userId: string;
  amount: number;
  provider: "MOMO" | "AIRTEL_MONEY";
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }

  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true },
  });

  const balance = Number(userBalance?.balance ?? 0);
  if (balance < params.amount) {
    throw { error: "Insufficient balance for withdrawal." };
  }

  const updatedBalance = balance - params.amount;
  await prisma.userAccount.upsert({
    where: { userId: params.userId },
    update: { balance: updatedBalance },
    create: {
      userId: params.userId,
      balance: updatedBalance,
    },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId: params.userId,
      amount: -Math.abs(params.amount),
      type: "WITHDRAWAL",
      tax: 0,
    },
  });

  return {
    ...tx,
    balance: updatedBalance,
    meta: { provider: params.provider },
  };
};

export const getBalance = async (params: { userId: string }) => {
  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true },
  });
  return Number(userBalance?.balance ?? 0);
};
