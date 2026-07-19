const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(
  `wss://production-sfo.browserless.io/stealth?token=${process.env.BROWSERLESS_TOKEN}`
);

  const page = await browser.newPage();

  await page.goto("https://herohero.co/login");

  await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

  await page.locator("button").last().click();

  await page.waitForTimeout(3000);

  console.log(await page.content());

await page.screenshot({ path: "login.png", fullPage: true });
  
  await browser.close();
})();
