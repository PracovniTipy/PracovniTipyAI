const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: false
  });

  const page = await browser.newPage();

  await page.goto("https://herohero.co/login");

  await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

  await page.locator('input[type="password"]').fill(process.env.HERO_PASSWORD);

  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForLoadState("networkidle");

  console.log("Prihlaseni uspesne");

  await page.waitForTimeout(10000);

  await browser.close();
})();
