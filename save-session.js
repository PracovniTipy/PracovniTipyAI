const { chromium } = require("playwright");
const path = require("path");

const PROFILE_DIR = path.resolve(process.env.HEROHERO_PROFILE_DIR || path.join(__dirname, "herohero-profile"));

(async () => {
  console.log(`Používám persistentní HeroHero profil: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "cs-CZ",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await context.newPage();
  await page.goto("https://herohero.co/create", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("Přihlas se ručně v otevřeném prohlížeči.");
  console.log("Až bude po přihlášení dostupná stránka https://herohero.co/create, vrať se sem a stiskni Enter.");

  await new Promise(resolve => process.stdin.once("data", resolve));

  console.log("Ukládám persistentní profil zavřením contextu.");
  await context.close();
  console.log(`Hotovo. Stejný profil použije publishHeroHero.js: ${PROFILE_DIR}`);
  process.exit(0);
})();
