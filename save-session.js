const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://herohero.co/login');
  console.log("👉 Přihlas se ručně v prohlížeči. Až budeš přihlášený, klikni zpátky sem do terminálu a stiskni Enter...");
  
  await new Promise(resolve => process.stdin.once('data', resolve));

  await context.storageState({ path: 'herohero-auth.json' });
  console.log("✅ Hotovo! Soubor herohero-auth.json byl úspěšně vytvořen.");
  await browser.close();
  process.exit(0);
})();