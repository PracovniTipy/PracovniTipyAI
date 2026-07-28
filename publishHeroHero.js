const { chromium } = require("playwright");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - ULTIMATE RESILIENT");
console.log("==========================================");

const CONFIG = {
  HEADLESS: process.env.HEADLESS !== "false",
  TIMEOUTS: {
    PAGE_NAVIGATION: 35000,
    ELEMENT_WAIT: 20000,
    LOGIN_WAIT: 15000,
  },
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  LOCALE: "cs-CZ",
};

async function handleCookieBannerIfPresent(page) {
  const candidateSelectors = [
    'button[data-testid="cookie-modal-agree"]',
    '[data-testid="cookie-modal-agree"]',
    'button:has-text("Povolit vše")',
    'button:has-text("Accept")',
  ];

  for (const selector of candidateSelectors) {
    if (page.isClosed()) return;
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);
    if (count > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.click({ timeout: 5000 }).catch(() => {});
      break;
    }
  }
}

async function nukeOverlays(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay, [role="dialog"], div[class*="modal"], div[class*="overlay"]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
        }
      });
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    // Ignorujeme
  }
}

async function getLoginModal(page) {
  const modalHandles = await page.locator('[role="dialog"], [class*="modal" i]').all();
  for (const handle of modalHandles) {
    const hasInputs = (await handle.locator('input[type="email"], input[name="email"], input[type="password"]').count().catch(() => 0)) > 0;
    const isVisible = await handle.isVisible().catch(() => false);
    if (hasInputs && isVisible) return handle;
  }
  const directForm = page.locator('form, div').filter({ has: page.locator('input[type="email"]') }).first();
  if (await directForm.isVisible().catch(() => false)) return directForm;
  
  return null;
}

async function executeModalLogin(page, email, password) {
  let loginModal = null;
  for (let i = 0; i < 15; i++) {
    loginModal = await getLoginModal(page);
    if (loginModal) break;
    await page.waitForTimeout(1000);
  }

  if (!loginModal) throw new Error("Přihlašovací formulář nebyl nalezen.");

  const emailInput = loginModal.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  
  await emailInput.click();
  await emailInput.fill(email);

  const arrowBtn = loginModal.locator('input[type="email"] ~ button, input[type="email"] + button, button:has(svg), button[type="submit"]').last();
  await arrowBtn.click();

  const passwordInput = loginModal.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });

  await passwordInput.click();
  await passwordInput.fill(password);

  const submitBtn = loginModal.locator('button:has-text("Pokračovat"), button[type="submit"]').last();
  await submitBtn.click();

  await page.waitForTimeout(4000);
}

function formatJobPost(job) {
  const title = job.title || "Pracovní nabídka";
  const salary = job.salary ? `💰 cca ${job.salary} Kč / měsíc` : null;
  const location = job.location ? `📍 ${job.location}` : null;
  const startDate = job.startDate ? `⏰ Nástup ${job.startDate}` : null;
  const contractType = job.contractType ? `🕒 ${job.contractType}` : null;
  const language = job.language ? `🌍 Jazyk: ${job.language}` : null;
  const link = job.link ? `🔗 Odkaz: ${job.link}` : null;

  let output = `${title}\n\n`;
  if (salary) output += `${salary}\n\n`;
  if (location) output += `${location}\n`;
  if (startDate) output += `${startDate}\n`;
  if (contractType) output += `${contractType}\n`;
  if (language) output += `${language}\n`;
  if (link) output += `${link}\n`;

  if (job.description && job.description.length > 0) {
    output += `\n🔧 Náplň práce\n\n`;
    for (const point of job.description) {
      output += `• ${point}\n`;
    }
  }

  if (job.accommodation && job.accommodation.length > 0) {
    output += `\n🏠 Ubytování\n\n`;
    for (const point of job.accommodation) {
      output += `• ${point}\n`;
    }
  }

  if (job.requirements && job.requirements.length > 0) {
    output += `\n📋 Požadavky\n\n`;
    for (const point of job.requirements) {
      output += `• ${point}\n`;
    }
  }

  if (job.advantages && job.advantages.length > 0) {
    output += `\n⭐ Výhody\n\n`;
    for (const point of job.advantages) {
      output += `• ${point}\n`;
    }
  }

  return output.trim();
}

async function createHeroHeroPost(page, job) {
  console.log(`Vytvářím příspěvek pro pozici: ${job.title}`);
  await page.goto("https://herohero.co/create", {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
  });

  await page.waitForTimeout(4000);
  await nukeOverlays(page);

  // 1. Nahrání obrázku
  if (job.imageUrl) {
    console.log("Nahrávám obrázek...");
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(job.imageUrl).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  await nukeOverlays(page);

  // 2. Vyplnění nadpisu s pojistkou pro případ zpožděného vykreslení
  console.log("Vyplňuji nadpis...");
  const titleInput = page.locator('#post-title-input, textarea, input[type="text"]').first();
  
  try {
    await titleInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  } catch (e) {
    console.log("⚠️ Nadpis nebyl hned viditelný, zkouším obnovit overlaye a počkat...");
    await nukeOverlays(page);
    await page.waitForTimeout(2000);
    await titleInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  }

  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  await titleInput.fill(job.title || "Nová pracovní nabídka");

  // 3. Vložení formátovaného textu
  console.log("Vkládám formátovaný text nabídky...");
  const formattedText = formatJobPost(job);
  
  await nukeOverlays(page);
  const editorArea = page.locator('div[contenteditable="true"], textarea').last();
  await editorArea.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  await editorArea.scrollIntoViewIfNeeded();
  await editorArea.click({ force: true });
  await editorArea.fill(formattedText);

  console.log(`Příspěvek "${job.title}" byl úspěšně vyplněn.`);
}

async function publishHeroHero(job) {
  let browser;
  try {
    browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
    });

    const page = await context.newPage();
    
    console.log("Otevírám herohero.co/login...");
    await page.goto("https://herohero.co/login", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });

    await handleCookieBannerIfPresent(page);

    const email = process.env.HEROHERO_EMAIL;
    const password = process.env.HEROHERO_PASSWORD;
    if (!email || !password) throw new Error("Chybí přihlašovací údaje v prostředí.");

    await executeModalLogin(page, email, password);
    await createHeroHeroPost(page, job);

    return { success: true, job };
  } catch (err) {
    console.error(`❌ [CHYBA]:`, err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = publishHeroHero;
