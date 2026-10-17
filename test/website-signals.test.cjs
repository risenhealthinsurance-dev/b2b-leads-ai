const test = require("node:test");
const assert = require("node:assert/strict");

test("detects POS, wallet, and third-party ordering evidence from public HTML", async () => {
  const { detectSignals } = await import("../lib/website.js");
  const signals = detectSignals(`
    <html><head><meta name="viewport" content="width=device-width" /></head>
    <body>
      <script src="https://js.stripe.com/v3/"></script>
      <script src="https://cdn.clover.com/sdk.js"></script>
      <a href="https://t.yesware.com/redirect/ordering.chownow.com/order/1">Order Online</a>
      <button>Delivery</button>
    </body></html>
  `);

  assert.deepEqual(signals.paymentSignals, ["Stripe", "Clover"]);
  assert.deepEqual(signals.orderingPlatforms, ["ChowNow", "Yesware redirect"]);
  assert.equal(signals.orderingLinks[0].text, "Order Online");
  assert.ok(signals.orderingSignals.some((signal) => signal.includes("delivery-provider")));
  assert.ok(signals.salesTriggers.includes("Third-party ordering redirect"));
  assert.ok(signals.opportunityScore > 35);
});

test("does not invent payment or ordering evidence for sparse HTML", async () => {
  const { detectSignals } = await import("../lib/website.js");
  const signals = detectSignals("<html><head><title>Local business</title></head><body>Welcome</body></html>");

  assert.deepEqual(signals.paymentSignals, []);
  assert.deepEqual(signals.orderingPlatforms, []);
  assert.ok(signals.salesTriggers.includes("No public payment/POS technology detected"));
  assert.equal(signals.opportunityScore, 71);
});
