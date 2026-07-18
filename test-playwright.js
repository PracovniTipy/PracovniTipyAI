const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto("https://herohero.co", {
    waitUntil: "networkidle"
  });

  console.log(await page.title());

  await browser.close();
})();
