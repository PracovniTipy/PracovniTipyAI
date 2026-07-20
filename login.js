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
  
await page.screenshot({
  path: "02-email-filled.png",
  fullPage: true,
});  

  // Pokračovat
  const emailInput = page.locator('input[type="email"]');

await emailInput.locator("xpath=following::button[1]").click();

await page.waitForTimeout(3000);

console.log("Počet password inputů:");
  
console.log(await page.locator('input[type="password"]').count());
  
  await page.waitForTimeout(3000);

await page.screenshot({
  path: "03-after-click.png",
  fullPage: true,
});
  
console.log("URL po kliknutí:", page.url());

await page.waitForTimeout(3000);

console.log("URL po 3 s:", page.url());

console.log("Obsah stránky:");
console.log(await page.locator("body").innerText());
  
await page.locator('input[type="password"]').waitFor({
  state: "visible",
  timeout: 10000,
});

await page.locator('input[type="password"]').fill(process.env.HERO_PASSWORD);

  const passwordInput = page.locator('input[type="password"]');

await passwordInput.locator("xpath=following::button[1]").click();

  await page.waitForTimeout(5000);

console.log("URL po odeslání hesla:", page.url());

await page.waitForTimeout(5000);

  // Otevřít editor příspěvku
 await page.goto("https://herohero.co/create", {
  waitUntil: "domcontentloaded",
});

await page.waitForTimeout(5000);

await page.screenshot({
  path: "create.png",
  fullPage: true,
});

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
