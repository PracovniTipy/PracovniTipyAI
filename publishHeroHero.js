const { chromium } = require("playwright");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - MULTI-STEP WIZARD");
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
    const count = await loc.count().count ? await loc.count() : 0;
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
  for (let i = 0; i < 20; i++) {
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
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  await passwordInput.click();
  await passwordInput.fill(password);

  const submitBtn = loginModal.locator('button:has-text("Pokračovat"), button[type="submit"]').last();
  await submitBtn.click();

  await page.waitForTimeout(6000);
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
    }).catch(() => {});
  }

  console.log("Probouzím stránku simulací interakce pro vykreslení SPA...");
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

    if (titleInput) {
      console.log(`✅ Políčko nalezeno v pokusu č. ${attempt}`);
      break;
    }

    console.log(`⚠️ Pokus č. ${attempt}: Políčko nenalezeno, klikám do středu obrazovky a čekám...`);
    await page.mouse.click(500, 400);
    await page.waitForTimeout(5000);
  }

  if (!titleInput) {
    const fullHtml = await page.content();
    console.log("DEBUG - Celé HTML začátek:", fullHtml.slice(0, 500));
    throw new Error("Nepodařilo se najít políčko pro nadpis příspěvku.");
  }

  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  await page.keyboard.type(job.title || "Nová pracovní nabídka", { delay: 25 });
  console.log("✅ Nadpis úspěšně vyplněn.");

  await page.waitForTimeout(1000);

  console.log("Vkládám formátovaný text nabídky...");
  const formattedText = formatJobPost(job);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  const lines = formattedText.split("\n");
  for (const line of lines) {
    await page.keyboard.type(line, { delay: 5 });
    await page.keyboard.press("Enter");
  }

  // ==========================================
  // KROK 1 -> KROK 2: Přechod na kategorie
  // ==========================================
  console.log("Přecházím na další krok (kategorie)...");
  await page.mouse.click(945, 180);
  await page.waitForTimeout(3000);

  // Výběr kategorie
  if (job.category) {
    console.log(`Hledám a vybírám kategorii: ${job.category}`);
    const categoryBtn = page.locator(`button:has-text("${job.category}"), div:has-text("${job.category}")`).first();
    if (await categoryBtn.isVisible().catch(() => false)) {
      await categoryBtn.click({ force: true }).catch(() => {});
      console.log(`✅ Kategorie "${job.category}" vybrána.`);
    }
  }

  // ==========================================
  // KROK 2 -> KROK 3: Přechod do náhledu
  // ==========================================
  console.log("Přecházím do náhledu...");
  await page.mouse.click(945, 180);
  await page.waitForTimeout(3000);

  // ==========================================
  // KROK 3: Finální publikování (Tlačítko Sdílet)
  // ==========================================
  console.log("Hledám a klikám na tlačítko Sdílet...");
  
  const shareBtn = page.locator('button').filter({ hasText: /^Sdílet$/ }).first();
  if (await shareBtn.isVisible().catch(() => false)) {
    await shareBtn.click({ force: true });
    console.log("✅ Tlačítko Sdílet úspěšně stisknuto.");
  } else {
    console.log("Tlačítko Sdílet nenalezeno přes text, klikám na jeho souřadnice...");
    await page.mouse.click(1200, 180);
  }

  await page.waitForTimeout(2000);
  
  // Pojistka pro případné potvrzovací okno
  const confirmBtn = page.locator('button').filter({ hasText: /^Sdílet$|^Potvrdit$|^Ano$|^Publikovat$/ }).last();
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click({ force: true });
    console.log("✅ Potvrzeno v dialogovém okně.");
  }

  await page.waitForTimeout(5000);
  console.log(`Příspěvek "${job.title}" byl kompletně publikován.`);
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
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
