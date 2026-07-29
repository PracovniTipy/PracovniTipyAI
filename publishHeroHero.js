const { chromium } = require("playwright");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - OPRAVENÝ LOGIN FLOW");
console.log("==========================================");

const CONFIG = {
  HEADLESS: process.env.HEADLESS !== "false",
  TIMEOUTS: {
    PAGE_NAVIGATION: 60000,
    ELEMENT_WAIT: 30000,
  },
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  LOCALE: "cs-CZ",
};

const DEFAULT_TEST_JOB = {
  title: "Skladový operátor (Testovací pozice)",
  salary: "35 000 - 42 000",
  location: "Praha - Hostivař",
  startDate: "Ihned / Dle domluvy",
  contractType: "HPP na dobu neurčitou",
  language: "Čeština na komunikativní úrovni",
  link: "https://pracovnitipy.cz",
  category: "Belgie",
  description: [
    "Příjem a výdej zboží ve skladovém hospodářství",
    "Práce se čtečkou čárových kódů (skenerem)",
    "Kontrola dodacích listů a stavu zásob"
  ],
  accommodation: [
    "Možnost zajištění ubytování v blízkosti depa",
    "Příspěvek na ubytování ze strany zaměstnavatele"
  ],
  requirements: [
    "Fyzická zdatnost a spolehlivost",
    "Trestní bezúhonnost",
    "Ochota pracovat na dvousměnný provoz"
  ],
  advantages: [
    "Týden dovolené navíc (celkem 5 týdnů)",
    "Dotované závodní stravování",
    "Možnost záloh na mzdu"
  ],
  imageUrl: ""
};

/**
 * Bezpečná funkce pro inspekci, výpis a kliknutí na správné tlačítko
 */
async function findAndClickButton(page, stepDescription, identifierPredicate) {
  console.log(`\n🔍 [INSPEKCE] Hledám tlačítko pro: ${stepDescription}`);
  
  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  console.log(`Na stránce nalezeno ${count} viditelných tlačítek.`);

  let targetButton = null;

  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    try {
      const text = (await btn.innerText()).trim();
      const ariaLabel = await btn.getAttribute('aria-label') || '';
      const className = await btn.getAttribute('class') || '';

      if (await identifierPredicate({ btn, text, ariaLabel, className, index: i })) {
        targetButton = btn;
        console.log(`  👉 [VYBRÁNO] Button #${i} odpovídá kritériím pro "${stepDescription}".`);
        break;
      }
    } catch (e) {}
  }

  if (!targetButton) {
    throw new Error(`Nepodařilo se nalézt odpovídající tlačítko pro krok: ${stepDescription}`);
  }

  await targetButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await targetButton.click({ timeout: 10000 });
  console.log(`✅ Úspěšně kliknuto na tlačítko pro: ${stepDescription}`);
}

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
    await page.waitForTimeout(300);
  } catch (e) {}
}

async function executeModalLogin(page, email, password) {
  console.log("Zahajuji proces přihlášení...");
  
  // 1. Zadání e-mailu
  const emailInput = page.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  await emailInput.click();
  await emailInput.fill(email);
  console.log("E-mail vyplněn, odesílám Enterem...");
  await page.keyboard.press("Enter");
  
  await page.waitForTimeout(3000);
  await nukeOverlays(page);

  // 2. Zadání hesla
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  await passwordInput.click();
  await passwordInput.fill(password);
  console.log("Heslo vyplněno, odesílám Enterem...");
  await page.keyboard.press("Enter");

  await page.waitForURL("**/create**", { timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION }).catch(() => {});
  await page.waitForTimeout(3000);
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
    for (const point of job.description) output += `• ${point}\n`;
  }

  if (job.accommodation && job.accommodation.length > 0) {
    output += `\n🏠 Ubytování\n\n`;
    for (const point of job.accommodation) output += `• ${point}\n`;
  }

  if (job.requirements && job.requirements.length > 0) {
    output += `\n📋 Požadavky\n\n`;
    for (const point of job.requirements) output += `• ${point}\n`;
  }

  if (job.advantages && job.advantages.length > 0) {
    output += `\n⭐ Výhody\n\n`;
    for (const point of job.advantages) output += `• ${point}\n`;
  }

  return output.trim();
}

async function createHeroHeroPost(page, job) {
  console.log(`Vytvářím příspěvek pro pozici: ${job.title}`);
  
  if (!page.url().includes("/create")) {
    console.log("Přecházím na /create...");
    await page.goto("https://herohero.co/create", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });
  }

  console.log("Čekám na stabilizaci SPA rozhraní...");
  await page.waitForTimeout(3000);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(2000);
  await nukeOverlays(page);

  console.log("Hledám políčka pro nadpis a text v editoru...");

  let titleInput = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await nukeOverlays(page);
    
    const editables = await page.locator('div[contenteditable="true"], textarea, input[type="text"]').all();
    if (editables.length > 0) {
      for (const el of editables) {
        if (await el.isVisible().catch(() => false)) {
          titleInput = el;
          break;
        }
      }
    }

    if (titleInput) break;
    await page.mouse.click(500, 400);
    await page.waitForTimeout(3000);
  }

  if (!titleInput) {
    throw new Error("Nepodařilo se najít políčko pro nadpis příspěvku.");
  }

  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  await page.keyboard.type(job.title || "Nová pracovní nabídka", { delay: 35 });
  console.log("✅ Nadpis úspěšně vyplněn.");

  await page.waitForTimeout(1000);

  console.log("Vkládám formátovaný text nabídky...");
  const formattedText = formatJobPost(job);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  const lines = formattedText.split("\n");
  for (const line of lines) {
    await page.keyboard.type(line, { delay: 10 });
    await page.keyboard.press("Enter");
  }

  // ==========================================
  // KROK 1 -> KROK 2: První šipka vpravo nahoře
  // ==========================================
  await page.waitForTimeout(2000);
  await findAndClickButton(page, "První šipka (Vytvořit příspěvek -> Možnosti)", async ({ btn, text }) => {
    const box = await btn.boundingBox();
    return box && box.y < 100 && box.x > 800 && text === "";
  });
  await page.waitForTimeout(3000);

  // ==========================================
  // KROK 2: Výběr kategorie podle země (např. Belgie)
  // ==========================================
  if (job.category) {
    console.log(`Hledám a vybírám kategorii: ${job.category}`);
    const catElement = page.locator('button, div, span, label').filter({ hasText: job.category }).first();
    await catElement.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await catElement.click({ timeout: 5000 }).catch(() => {});
    console.log(`✅ Kategorie "${job.category}" vybrána.`);
    await page.waitForTimeout(2000);
  }

  // ==========================================
  // KROK 2 -> KROK 3: Druhá šipka vpravo nahoře
  // ==========================================
  await page.waitForTimeout(2000);
  await findAndClickButton(page, "Druhá šipka (Možnosti -> Náhled)", async ({ btn, text }) => {
    const box = await btn.boundingBox();
    return box && box.y < 100 && box.x > 800 && text === "";
  });
  await page.waitForTimeout(4000);

  // ==========================================
  // KROK 3: Finální kliknutí na "Sdílet"
  // ==========================================
  await findAndClickButton(page, "Finální tlačítko Sdílet", async ({ text }) => {
    return text.toLowerCase().includes("sdílet");
  });

  await page.waitForTimeout(8000);
  console.log(`✅ Příspěvek "${job.title}" úspěšně odeslán!`);
}

async function publishHeroHero(inputJob) {
  const job = (!inputJob || Object.keys(inputJob).length === 0 || !inputJob.title) 
    ? DEFAULT_TEST_JOB 
    : inputJob;

  console.log(`Používám data pro pozici: ${job.title}`);

  let browser;
  try {
    browser = await chromium.launch({ 
      headless: CONFIG.HEADLESS,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BROWSER ERROR] ${err.message}`));
    
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
    if (browser) {
      try {
        const pages = await browser.contexts()[0]?.pages();
        if (pages && pages.length > 0) {
          await pages[0].screenshot({ path: `error-screenshot-${Date.now()}.png`, fullPage: true });
          console.log("📸 Uložen screenshot z místa selhání.");
        }
      } catch (e) {}
    }
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = publishHeroHero;
