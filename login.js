const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io/stealth?token=${process.env.BROWSERLESS_TOKEN}`
  );

  const page = await browser.newPage();

  await page.goto("https://herohero.co/login", {
    waitUntil: "domcontentloaded",
  });

  await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

  await page.locator('input[type="password"]').fill(process.env.HERO_PASSWORD);

  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForLoadState("networkidle");

  console.log("✅ Přihlášení proběhlo.");

  await page.waitForTimeout(5000);

  await browser.close();
})();
