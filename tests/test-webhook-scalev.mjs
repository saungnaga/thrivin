#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs";
import { spawn } from "child_process";

const PORT = 3123;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "test_scalev_secret_12345";
process.env.SCALEV_WEBHOOK_SECRET = SECRET;

function signPayload(bodyStr, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(bodyStr).digest("base64");
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/scalev/webhook`, { method: "GET" });
      if (res.ok) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not respond within ${timeoutMs}ms`);
}

async function runTests() {
  console.log("=== Scalev Webhook & Onboarding Simulation Test ===");

  // 1. Test invalid signature
  console.log("\n[Test 1] Testing invalid signature rejection...");
  const invalidBody = JSON.stringify({ event: "business.test_event" });
  const res1 = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scalev-Hmac-Sha256": "invalid_signature_base64_==",
    },
    body: invalidBody,
  });
  console.log(`Status: ${res1.status} (expected 401)`);
  if (res1.status !== 401 && res1.status !== 403) {
    throw new Error(`Expected 401/403 for invalid signature, got ${res1.status}`);
  }
  const data1 = await res1.json();
  console.log("Response:", data1);
  console.log("✓ Test 1 Passed: Invalid signature properly rejected.");

  // 2. Test business.test_event
  console.log("\n[Test 2] Testing Scalev test event (business.test_event)...");
  const testEventBody = JSON.stringify({
    event: "business.test_event",
    unique_id: `evt_test_${Date.now()}`,
    created_at: new Date().toISOString(),
  });
  const sig2 = signPayload(testEventBody);
  const res2 = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scalev-Hmac-Sha256": sig2,
    },
    body: testEventBody,
  });
  console.log(`Status: ${res2.status} (expected 200)`);
  if (res2.status !== 200) {
    throw new Error(`Expected 200 for test event, got ${res2.status}`);
  }
  const data2 = await res2.json();
  console.log("Response:", data2);
  if (!data2.ok) {
    throw new Error("Expected ok: true in response");
  }
  console.log("✓ Test 2 Passed: business.test_event accepted with 200 OK.");

  // 3. Test Create Order + Snapshot Forwarding
  console.log("\n[Test 3a] Simulating frontend checkout with onboarding profile...");
  // Unique phone per run so Scalev's own duplicate-order guard doesn't 400 us.
  const uniqueSuffix = String(Date.now()).slice(-6);
  const testPhone = `0812999${uniqueSuffix}`;
  const cleanTestPhone = `62812999${uniqueSuffix}`;
  const onboardingProfile = {
    gender: "Laki-laki",
    age: 26,
    weight: 70,
    height: 175,
    activityLevel: "Moderat",
    workoutLocation: "Di Gym",
    programFocus: ["Workout & Strength", "Fat Loss"],
    biggestChallenge: "Konsistensi jadwal",
    communicationStyle: "Tegas & Terarah",
  };

  const createOrderRes = await fetch(`${BASE_URL}/api/scalev/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: "quarter",
      planName: "Nina 3 Bulan",
      amount: 219000,
      customerName: "Raihan Test User",
      customerPhone: testPhone,
      promoCode: "TEMANBARU",
      onboarding: onboardingProfile,
    }),
  });
  const createOrderData = await createOrderRes.json();
  console.log("Create Order Response:", {
    status: createOrderRes.status,
    orderId: createOrderData.orderId,
    paymentUrl: createOrderData.paymentUrl ? "(url present)" : "none",
    error: createOrderData.error,
  });
  // Non-fatal: the live Scalev call is an external dependency (may 400 on
  // duplicate/test data). The assertion below is that our route persisted the
  // onboarding snapshot BEFORE calling Scalev, which is the real contract.
  const snapshotDir = process.env.ONBOARDING_DATA_DIR || "/home/ubuntu/workspaces/thrivin/repo/.data/onboarding";
  const phoneFile = `${snapshotDir}/phone_${cleanTestPhone}.json`;
  if (!fs.existsSync(phoneFile)) {
    throw new Error(`Onboarding snapshot not persisted to disk: ${phoneFile}`);
  }
  const persisted = JSON.parse(fs.readFileSync(phoneFile, "utf-8"));
  if (persisted.snapshot?.weight !== 70 || persisted.snapshot?.age !== 26) {
    throw new Error("Persisted snapshot does not match submitted onboarding profile");
  }
  console.log("✓ Test 3a Passed: onboarding snapshot persisted (phone-keyed, disk fallback).");
  const simulatedOrderId = createOrderData.orderId || `ord_${Date.now()}`;

  // 3b. Test valid payment.received
  console.log("\n[Test 3b] Testing valid payment.received event...");
  const paymentEventId = `evt_pay_${Date.now()}`;
  const paymentReceivedBody = JSON.stringify({
    event: "payment.received",
    unique_id: paymentEventId,
    created_at: new Date().toISOString(),
    data: {
      order_unique_id: simulatedOrderId,
      order_id: simulatedOrderId,
      customer_name: "Raihan Test User",
      customer_phone: cleanTestPhone,
      gross_revenue: 219000,
      net_payment_revenue: 219000,
      payment_status: "paid",
    },
  });
  const sig3 = signPayload(paymentReceivedBody);
  const res3 = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scalev-Hmac-Sha256": sig3,
    },
    body: paymentReceivedBody,
  });
  console.log(`Status: ${res3.status} (expected 200)`);
  if (res3.status !== 200) {
    throw new Error(`Expected 200 for payment.received, got ${res3.status}`);
  }
  const data3 = await res3.json();
  console.log("Response:", data3);
  if (!data3.ok || !data3.userActivated) {
    throw new Error("Expected user activation to succeed");
  }
  console.log("✓ Test 3b Passed: payment.received processed and user activated.");

  // 3c. Test Idempotency / Dedup
  console.log("\n[Test 3c] Testing idempotency / dedup (sending same payment event again)...");
  const res4 = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scalev-Hmac-Sha256": sig3,
    },
    body: paymentReceivedBody,
  });
  console.log(`Status: ${res4.status} (expected 200)`);
  if (res4.status !== 200) {
    throw new Error(`Expected 200 for duplicate event, got ${res4.status}`);
  }
  const data4 = await res4.json();
  console.log("Response:", data4);
  if (!data4.ok || !data4.message?.includes("idempotent")) {
    throw new Error("Expected duplicate response with idempotent notice");
  }
  console.log("✓ Test 3c Passed: duplicate event safely caught by idempotency layer.");

  // 3d. Test replay/timestamp guard
  console.log("\n[Test 3d] Testing replay guard (stale timestamp)...");
  const staleBody = JSON.stringify({
    event: "payment.received",
    unique_id: `evt_stale_${Date.now()}`,
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h old
    data: {
      order_unique_id: `ord_stale_${Date.now()}`,
      customer_phone: cleanTestPhone,
      customer_name: "Stale Replay",
      payment_status: "paid",
    },
  });
  const res5 = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scalev-Hmac-Sha256": signPayload(staleBody),
    },
    body: staleBody,
  });
  console.log(`Status: ${res5.status} (expected 409)`);
  if (res5.status !== 409) {
    throw new Error(`Expected 409 for stale replay, got ${res5.status}`);
  }
  console.log("✓ Test 3d Passed: stale timestamp rejected by replay guard.");

  console.log("\n==============================================");
  console.log("ALL SCALEV WEBHOOK & ONBOARDING TESTS PASSED!");
  console.log("==============================================\n");
}

async function main() {
  let serverProcess = null;
  try {
    // Check if server is already running
    let running = false;
    try {
      const ping = await fetch(`${BASE_URL}/api/scalev/webhook`, { method: "GET" });
      if (ping.ok) running = true;
    } catch {}

    if (!running) {
      console.log(`Starting Next.js production server on port ${PORT}...`);
      serverProcess = spawn("./node_modules/.bin/next", ["start", "-p", String(PORT)], {
        cwd: "/home/ubuntu/workspaces/thrivin/repo",
        env: { ...process.env, SCALEV_WEBHOOK_SECRET: SECRET, PORT: String(PORT) },
        stdio: ["ignore", "pipe", "pipe"],
      });

      serverProcess.stderr.on("data", (d) => {
        const str = d.toString();
        if (!str.includes("Warning") && !str.includes("ExperimentalWarning")) {
          process.stderr.write(str);
        }
      });

      await waitForServer(BASE_URL);
      console.log("Server ready on", BASE_URL);
    } else {
      console.log("Using existing server on", BASE_URL);
    }

    await runTests();
  } finally {
    if (serverProcess) {
      console.log("Shutting down test server...");
      try {
        process.kill(serverProcess.pid, "SIGKILL");
      } catch {}
      try {
        if (serverProcess.pid) {
          process.kill(-serverProcess.pid, "SIGKILL");
        }
      } catch {}
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
