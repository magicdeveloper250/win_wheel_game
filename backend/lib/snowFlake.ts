 
const EPOCH: bigint = BigInt(
  process.env.SNOWFLAKE_EPOCH ?? "1577836800000"
);

const DATACENTER_ID: bigint = BigInt(
  process.env.SNOWFLAKE_DATACENTER_ID ?? "0"
);

const WORKER_ID: bigint = BigInt(
  process.env.SNOWFLAKE_WORKER_ID ?? "0"
);

// Validate ranges
if (DATACENTER_ID < 0n || DATACENTER_ID > 31n) {
  throw new RangeError(
    `SNOWFLAKE_DATACENTER_ID must be 0–31, got ${DATACENTER_ID}`
  );
}
if (WORKER_ID < 0n || WORKER_ID > 31n) {
  throw new RangeError(
    `SNOWFLAKE_WORKER_ID must be 0–31, got ${WORKER_ID}`
  );
}

// ---------------------------------------------------------------------------
// Bit-shift constants
// ---------------------------------------------------------------------------

const SEQUENCE_BITS = 12n;
const WORKER_BITS = 5n;
const DATACENTER_BITS = 5n;

const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

const WORKER_SHIFT = SEQUENCE_BITS; // 12
const DATACENTER_SHIFT = SEQUENCE_BITS + WORKER_BITS; // 17
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS + DATACENTER_BITS; // 22

// ---------------------------------------------------------------------------
// Mutable generator state
// ---------------------------------------------------------------------------

let lastTimestamp = -1n;
let sequence = 0n;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function currentTimestamp(): bigint {
  return BigInt(Date.now()) - EPOCH;
}

function waitForNextMillis(last: bigint): bigint {
  let ts = currentTimestamp();
  while (ts <= last) {
    ts = currentTimestamp();
  }
  return ts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a unique Snowflake ID as a `bigint`.
 *
 * Thread-safe within a single Node.js event loop tick (synchronous).
 * Up to 4,096 unique IDs can be generated per millisecond per worker.
 */
export function generateSnowflakeId(): bigint {
  let ts = currentTimestamp();

  if (ts < lastTimestamp) {
    throw new Error(
      `Clock moved backwards. Refusing to generate IDs for ${
        lastTimestamp - ts
      } ms`
    );
  }

  if (ts === lastTimestamp) {
    sequence = (sequence + 1n) & MAX_SEQUENCE;
    if (sequence === 0n) {
      ts = waitForNextMillis(lastTimestamp);
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = ts;

  return (
    (ts << TIMESTAMP_SHIFT) |
    (DATACENTER_ID << DATACENTER_SHIFT) |
    (WORKER_ID << WORKER_SHIFT) |
    sequence
  );
}

/**
 * Generate a Snowflake ID as a decimal string (safe for JSON / databases
 * that don't support 64-bit integers natively).
 */
export function generateSnowflakeIdString(): string {
  return generateSnowflakeId().toString();
}

/**
 * Decode a Snowflake ID back into its components.
 */
export interface SnowflakeComponents {
  id: bigint;
  timestamp: Date;
  datacenterId: number;
  workerId: number;
  sequence: number;
}

export function decodeSnowflakeId(id: bigint | string): SnowflakeComponents {
  const n = typeof id === "string" ? BigInt(id) : id;

  const ts = (n >> TIMESTAMP_SHIFT) + EPOCH;
  const datacenterId = Number((n >> DATACENTER_SHIFT) & 31n);
  const workerId = Number((n >> WORKER_SHIFT) & 31n);
  const seq = Number(n & MAX_SEQUENCE);

  return {
    id: n,
    timestamp: new Date(Number(ts)),
    datacenterId,
    workerId,
    sequence: seq,
  };
}

 