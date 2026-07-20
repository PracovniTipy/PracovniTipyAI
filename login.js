const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io/stealth?token=${process.env.BROWSERLESS_TOKEN}`
  );

  const page = await browser.newPage();
  
page.on("request", (request) => {
  const url = request.url();

  if (url.includes("/auth") || url.includes("/oauth")) {
    console.log("======== REQUEST ========");
    console.log(request.method(), url);

    try {
      console.log(request.postData());
    } catch {}

    console.log("=========================");
  }
});
  
  page.on("response", async (response) => {
  const url = response.url();

  if (url.includes("/auth") || url.includes("/oauth")) {
    console.log("======== AUTH ========");
    console.log(response.status(), response.request().method(), url);

    console.log("HEADERS:");
    console.log(response.headers());

    try {
      console.log("BODY:");
      console.log(await response.text());
    } catch (e) {
      console.log("Body nelze přečíst");
    }

    console.log("======================");
  }
});
  
  // Login
  await page.goto("https://herohero.co/login");

  await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

  // Pokračovat
  await page.locator("button").last().click();

  // Počkat na heslo
  await page.locator('input[type="password"]').waitFor({
    timeout: 10000,
  });

  // Přihlásit
await page.locator("button").last().click();

// Počkat po přihlášení
await page.waitForTimeout(5000);
  
  // Vyplnit heslo
  await page.locator('input[type="password"]').fill(process.env.HERO_PASSWORD);

  // Přihlásit
  await page.locator("button").last().click();

  // Počkat po přihlášení
  await page.waitForTimeout(5000);

  // Otevřít editor příspěvku
  await page.goto("https://herohero.co/create");

  await page.waitForTimeout(5000);

  // Zjistit počet contenteditable prvků
  const editors = await page.locator('[contenteditable="true"]').count();
  console.log("Počet contenteditable:", editors);

  // Vypsat všechny inputy a textarea
  const inputs = await page
    .locator("input, textarea")
    .evaluateAll((elements) =>
      elements.map((el) => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        aria: el.getAttribute("aria-label"),
      }))
    );

  console.log(JSON.stringify(inputs, null, 2));

  // Vypsat URL
  console.log(await page.url());

  // Screenshot
  await page.screenshot({
    path: "create.png",
    fullPage: true,
  });

  console.log("Přihlášení proběhlo.");

  await browser.close();
})();
