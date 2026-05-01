import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ─── Custom Metrics ───────────────────────────────────────────────
const wsMessagesReceived = new Counter("ws_messages_received");
const wsLatency          = new Trend("ws_latency_ms");
const httpErrors         = new Counter("http_errors");

// ─── Config ───────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const WS_URL   = __ENV.WS_URL   || "ws://localhost:3000/ws";

// ─── Setup — runs ONCE before test, creates reusable users ────────
export function setup() {
  const users = [];

  for (let i = 0; i < 10; i++) {
    const email    = `impanomanzienock1@gmail.com`;
    const password = "Password123.";

    
    // Login and grab token
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: { "Content-Type": "application/json" } }
    );

    if (res.status === 200) {
      const token = res.json("token");
      if (token) {
        users.push({ email, token });
        console.log(`✓ Ready: ${email}`);
      }
    } else {
      console.error(`✗ Login failed for ${email}: ${res.status}`);
    }
  }

  console.log(`\n✓ ${users.length} test users ready\n`);
  return { users };
}

// ─── Test Options ─────────────────────────────────────────────────
export let options = {
  scenarios: {
    // HTTP: ramp up to 200 users
    http_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50  },
        { duration: "30s", target: 200 },
        { duration: "30s", target: 200 },
        { duration: "15s", target: 0   },
      ],
      exec: "httpScenario",
    },

    // WebSocket: 500 concurrent connections
    ws_load: {
      executor: "constant-vus",
      vus: 500,
      duration: "90s",
      exec: "wsScenario",
    },
  },

  thresholds: {
    http_req_duration:    ["p(95)<500"], // 95% requests under 500ms
    http_req_failed:      ["rate<0.05"], // under 5% errors
    ws_messages_received: ["count>10"],  // at least some WS messages
  },
};

// ─── Helpers ──────────────────────────────────────────────────────
function pickUser(data) {
  // Each VU picks a random pre-created user — no login spam
  return data.users[Math.floor(Math.random() * data.users.length)];
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── HTTP Scenario ────────────────────────────────────────────────
export function httpScenario(data) {
  const user = pickUser(data);
  if (!user) { httpErrors.add(1); return; }

  const { token } = user;

  // Health check (no auth needed)
  const health = http.get(`${BASE_URL}/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  sleep(0.3);

  // Sessions list
  const sessions = http.get(`${BASE_URL}/sessions`, { headers: authHeaders(token) });
  check(sessions, { "sessions 200": (r) => r.status === 200 });
  sleep(0.3);

  // Multipliers list
  const multipliers = http.get(`${BASE_URL}/multipliers`, { headers: authHeaders(token) });
  check(multipliers, { "multipliers 200": (r) => r.status === 200 });
  sleep(0.3);

  // Target numbers
  const targets = http.get(`${BASE_URL}/target-numbers`, { headers: authHeaders(token) });
  check(targets, { "targets 200": (r) => r.status === 200 });
  sleep(0.3);

  // Deposit
  const deposit = http.post(
    `${BASE_URL}/transactions/deposit`,
    JSON.stringify({ amount: 50, provider: "MOMO" }),
    { headers: authHeaders(token) }
  );
  check(deposit, { "deposit ok": (r) => r.status === 200 || r.status === 201 });
  sleep(0.3);

  // Place bet
  const bet = http.post(
    `${BASE_URL}/bets`,
    JSON.stringify({ targetNumber: 5, amount: 10 }),
    { headers: authHeaders(token) }
  );
  check(bet, { "bet ok": (r) => r.status === 200 || r.status === 201 });

  sleep(1);
}

// ─── WebSocket Scenario ───────────────────────────────────────────
export function wsScenario(data) {
  const user = pickUser(data);
  if (!user) { httpErrors.add(1); return; }

  const url   = `${WS_URL}?token=${user.token}`;
  const start = Date.now();

  const res = ws.connect(url, {}, (socket) => {
    socket.on("open", () => {
      check(socket, { "ws connected": () => true });

      // Join game room
      socket.send(JSON.stringify({ type: "join", room: "game" }));

      // Ping every 5 seconds to keep alive + measure latency
      socket.setInterval(() => {
        socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }, 5000);
    });

    socket.on("message", (raw) => {
      wsMessagesReceived.add(1);
      try {
        const msg = JSON.parse(raw);
        if (msg.timestamp) wsLatency.add(Date.now() - msg.timestamp);
      } catch (_) {}
    });

    socket.on("error",  (e) => { console.error("WS error:", e.message); httpErrors.add(1); });
    socket.on("close",  ()  => { wsLatency.add(Date.now() - start); });

    // Disconnect after 60 seconds
    socket.setTimeout(() => socket.close(), 60000);
  });

  check(res, { "ws handshake 101": (r) => r && r.status === 101 });
}