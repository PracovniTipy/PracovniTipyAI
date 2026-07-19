const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(
  `wss://production-sfo.browserless.io/stealth?token=${process.env.BROWSERLESS_TOKEN}`
);

  const page = await browser.newPage();

  await page.goto("https://herohero.co/login");

  await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

  // klik na pokračovat po zadání e-mailu
await page.locator("button").last().click();

// počkej na pole pro heslo
await page.locator('input[type="password"]').waitFor({
  timeout: 10000
});

// vyplň heslo
await page.locator('input[type="password"]').fill(process.env.HERO_PASSWORD);

// klik na Přihlásit se
await page.locator("button").last().click();

// počkej na načtení stránky
await page.waitForTimeout(5000);

const editors = await page.locator('[contenteditable="true"]').count();
console.log("Počet contenteditable:", editors);
  
await page.locator('[contenteditable="true"]').first().click();

await page.keyboard.type("TEST - Automatický příspěvek");
  
console.log(await page.url());

await page.screenshot({
  path: "create.png",
  fullPage: true
});

console.log("Přihlášení proběhlo.");
  
  await browser.close();
})();
