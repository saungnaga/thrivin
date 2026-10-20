/**
 * Source-level checks for the W1 copy rules.
 * Run: node --experimental-strip-types tests/test-web-copy-copy.mts
 *      COPY_ROOT=/path/to/other/tree node --experimental-strip-types tests/test-web-copy-copy.mts
 *
 * COPY_ROOT lets a reviewer point the same assertions at another revision
 * (the pre-fix tree) and watch them fail — that is the negative proof, there is
 * no mocked success here: every check reads real files off disk.
 *
 * Why source checks and not screenshots: a claim can survive a component
 * refactor ("Mulai dari Rp 39.000/bulan" lived in three files) and a screenshot
 * proves only the one page that was rendered.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.env.COPY_ROOT
  ? path.resolve(process.env.COPY_ROOT)
  : path.resolve(import.meta.dirname, "..");

const UI_FILES = {
  home: "src/app/page.tsx",
  nina: "src/app/companion/nina/page.tsx",
  chat: "src/components/AIChatWidget.tsx",
  jsonLd: "src/components/JsonLd.tsx",
  checkout: "src/app/companion/nina/onboarding/[step]/page.tsx",
} as const;

function read(rel: string): string {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`missing file: ${abs}`);
  return fs.readFileSync(abs, "utf8");
}

const results: [string, string][] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${(err as Error).message}`]);
  }
}

const src = Object.fromEntries(
  Object.entries(UI_FILES).map(([key, rel]) => [key, read(rel)])
) as Record<keyof typeof UI_FILES, string>;

// ── A1: no "Mulai dari Rp 39.000/bulan" claim survives anywhere ──────────────
for (const [key, text] of Object.entries(src)) {
  check(`A1: no Rp 39.000 / 39rb / 39000 claim in ${key}`, () => {
    for (const bad of ["39.000", "39rb", "39000"]) {
      assert.ok(
        !text.includes(bad),
        `${UI_FILES[key as keyof typeof UI_FILES]} still contains "${bad}"`
      );
    }
  });
}

// Keputusan owner 20/10/2026 ("gausah kasih harga"): halaman marketing tidak
// menampilkan nominal sama sekali. Batas tegas: marketing = tanpa harga,
// checkout = dengan harga. Assertion ini dulu menuntut kebalikannya (harga
// wajib tampil dari katalog), jadi dibalik — bukan dihapus — supaya kalau ada
// yang memasang harga lagi di marketing, suite FAIL.
for (const key of ["home", "nina"] as const) {
  check(`A1: ${key} shows no price at all`, () => {
    for (const bad of ["Paket mulai", "Rp ", "entryPrice(", "formatIdr("]) {
      assert.ok(
        !src[key].includes(bad),
        `${UI_FILES[key]} still shows a price ("${bad}")`
      );
    }
  });
}

check("A1: marketing still advertises the promo code + discount", () => {
  for (const key of ["home", "nina"] as const) {
    assert.ok(
      src[key].includes("TEMANBARU_PROMO.code") &&
        src[key].includes("TEMANBARU_PROMO.discountPercent"),
      `${UI_FILES[key]} must keep the promo code and discount percentage`
    );
  }
});

check("A1: checkout keeps the amount the customer is paying", () => {
  assert.ok(
    src.checkout.includes("Rp {formatIdr("),
    "checkout must still render the nominal price"
  );
});

check("A1: chat answer lists plans from the catalog", () => {
  assert.ok(src.chat.includes("planPriceLine()"), "chat must build its price line from the catalog");
});

check("A1: JSON-LD tidak lagi memuat harga (keputusan owner 20/10)", () => {
  // Owner: "gausah kasih harga". `offers` dihapus total supaya Google tidak
  // menampilkan nominal di cuplikan pencarian, bukan cuma disembunyikan di UI.
  assert.ok(!/lowPrice|highPrice|priceCurrency/.test(src.jsonLd), "JSON-LD must not carry any price field");
  assert.ok(!src.jsonLd.includes("offerRange()"), "JSON-LD must not compute an offer range anymore");
});

// ── A1b: 1-month option visible, still last, and reachable ───────────────────
check("A1b: 1-month option is a full-width, labelled button", () => {
  assert.ok(src.checkout.includes("Pilih 1 Bulan"), "missing visible 1-month CTA");
  assert.ok(
    /aria-label=\{`\$\{PLANS\.month\.name\}/.test(src.checkout),
    "1-month option needs an accessible name"
  );
  const monthIdx = src.checkout.indexOf("PLANS.month.name}</div>");
  const gridIdx = src.checkout.indexOf("3 Simple Cards Grid");
  assert.ok(monthIdx > gridIdx && gridIdx > -1, "1-month option must stay AFTER the plan grid");
});

// ── A3: promo labels are promo-aware ────────────────────────────────────────
check("A3: no hardcoded 'OFF 20%' / 'Diskon 20%' label", () => {
  for (const bad of ["OFF 20%", "Diskon 20%", "DISKON 20%"]) {
    assert.ok(!src.checkout.includes(bad), `checkout still hardcodes "${bad}"`);
    assert.ok(!src.home.includes(bad), `homepage still hardcodes "${bad}"`);
    assert.ok(!src.nina.includes(bad), `Nina page still hardcodes "${bad}"`);
  }
});
check("A3: discount pill + applied note come from the server quote", () => {
  assert.ok(src.checkout.includes("promoDiscountPill("), "pill must use promoDiscountPill()");
  assert.ok(src.checkout.includes("promoAppliedNote("), "note must use promoAppliedNote()");
});
check("A3: promo percentage is not typed into any UI copy", () => {
  for (const [key, text] of Object.entries(src)) {
    assert.ok(
      !/(diskon|promo)[^\n]{0,40}\d+\s*%/i.test(text),
      `${UI_FILES[key as keyof typeof UI_FILES]} types the promo percentage instead of TEMANBARU_PROMO`
    );
  }
});
check("A3: TEMANBAIKHATI wording is not shipped before owner approval", () => {
  for (const [key, text] of Object.entries(src)) {
    assert.ok(
      !text.includes("TEMANBAIKHATI"),
      `${UI_FILES[key as keyof typeof UI_FILES]} advertises an unapproved promo`
    );
  }
});
check("A3: no price literal is typed into the checkout JSX", () => {
  assert.ok(
    !/totalPrice:\s*\d/.test(src.checkout),
    "checkout still hardcodes totalPrice"
  );
  assert.ok(
    !/monthlyPrice:\s*\d/.test(src.checkout),
    "checkout still hardcodes monthlyPrice"
  );
  assert.ok(src.checkout.includes("PLAN_CATALOG"), "checkout must read PLAN_CATALOG");
});
check("A3: 'hemat X%' badges are computed, not typed", () => {
  assert.ok(
    src.checkout.includes('savingsVsMonthlyPercent("half")') &&
      src.checkout.includes('savingsVsMonthlyPercent("year")'),
    "badges must be computed from the catalog"
  );
});

// ── A4: guarantee prominent near price/CTA, same wording everywhere ─────────
for (const key of ["home", "nina", "checkout"] as const) {
  check(`A4: ${key} shows the guarantee from the shared constant`, () => {
    assert.ok(
      src[key].includes("REFUND_GUARANTEE_TITLE") &&
        src[key].includes("REFUND_GUARANTEE_TEXT"),
      `${UI_FILES[key]} must render the shared guarantee text`
    );
  });
}

// GARANSI-1 is CLOSED (Koron, owner ACC 18/10 — card t_91b4f733): the canonical
// refund window is "72 jam (3x24 jam) sejak pembayaran diterima", which is the
// exact same window the approved draft called "3 hari pertama". So both literals
// are accepted here. What stays pinned is the SUBSTANCE: a window from this set
// AND the "100%" amount must both be present, so no page can silently drop the
// window or weaken the amount. Do not add a third accepted form without the same
// kind of decision.
const GUARANTEE_TIMEFRAMES = ["3 hari pertama", "72 jam"] as const;

function hasGuaranteeWindow(text: string): boolean {
  return GUARANTEE_TIMEFRAMES.some((window) => text.includes(window));
}

check("A4: guarantee text matches the approved policy on /privacy", () => {
  const privacy = read("src/app/privacy/page.tsx");
  assert.ok(
    hasGuaranteeWindow(privacy),
    `privacy policy must state the approved window (${GUARANTEE_TIMEFRAMES.join(" | ")})`
  );
  assert.ok(privacy.includes("100%"), "privacy policy refund amount changed?");
  const shared = read("src/lib/pricing-copy.ts");
  assert.ok(
    hasGuaranteeWindow(shared) && shared.includes("100%"),
    "shared guarantee text must stay inside the approved policy"
  );
});

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} copy source checks passed (root: ${root})`);
process.exit(failed === 0 ? 0 : 1);
