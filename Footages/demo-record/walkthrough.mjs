/**
 * AgroTrace full-site narrated walkthrough recorder
 * Creates 3 users (Farmer, Consumer, Distributor) and visits major features.
 */
import { chromium } from 'playwright';
import { spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const AUDIO_DIR = path.join(OUT_DIR, 'audio');
const VIDEO_DIR = path.join(OUT_DIR, 'video');
const BASE = process.env.AGROTRACE_URL || 'http://localhost:5173';
const STAMP = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const PASSWORD = 'DemoWalk123!';

const USERS = {
  farmer: {
    email: `walk.farmer.${STAMP}@agrotrace.test`,
    firstName: 'Asha',
    lastName: 'Patel',
    role: 'FARMER',
  },
  consumer: {
    email: `walk.consumer.${STAMP}@agrotrace.test`,
    firstName: 'Rohan',
    lastName: 'Mehta',
    role: 'CONSUMER',
  },
  distributor: {
    email: `walk.distributor.${STAMP}@agrotrace.test`,
    firstName: 'Vikram',
    lastName: 'Singh',
    role: 'DISTRIBUTOR',
  },
};

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const cues = [];
let t0 = Date.now();
let cueIndex = 0;

function ffmpegBin() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    const winget = path.join(
      process.env.LOCALAPPDATA,
      'Microsoft',
      'WinGet',
      'Packages'
    );
    // fallback search is handled by PATH refresh in runner
    return 'ffmpeg';
  }
}

function ffprobeDuration(wavPath) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', wavPath],
      { encoding: 'utf8' }
    ).trim();
    return Math.max(0.5, parseFloat(out) || 2);
  } catch {
    // rough estimate: ~14 chars/sec
    return 2.5;
  }
}

function generateTts(text, outWav) {
  const ps1 = path.join(__dirname, 'generate-tts.ps1');
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Text', text, '-OutWav', outWav, '-Rate', '0'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.warn('TTS failed:', r.stderr || r.stdout);
  }
  return outWav;
}

async function narrate(page, text) {
  cueIndex += 1;
  const wav = path.join(AUDIO_DIR, `cue-${String(cueIndex).padStart(3, '0')}.wav`);
  console.log(`\n🎙️  [${cueIndex}] ${text}`);
  generateTts(text, wav);
  const startMs = Date.now() - t0;
  const dur = ffprobeDuration(wav);
  cues.push({ index: cueIndex, text, wav, startMs, durationSec: dur });
  // Keep the page visible for the full spoken line
  await page.waitForTimeout(Math.ceil(dur * 1000) + 400);
}

async function clearSession(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function goLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
}

async function registerUser(page, user) {
  await goLogin(page);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.waitForTimeout(400);
  await page.locator('#firstName').fill(user.firstName);
  await page.locator('#lastName').fill(user.lastName);
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#role').selectOption(user.role);
  await page.waitForTimeout(500);
  await Promise.all([
    page.waitForURL(/dashboard|marketplace|farmer|distributor/i, { timeout: 30000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(1500);
}

async function logoutViaStorage(page) {
  await clearSession(page);
  await goLogin(page);
}

async function safeClick(page, locator, timeout = 5000) {
  try {
    const el = typeof locator === 'string' ? page.locator(locator) : locator;
    await el.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function visitAndScroll(page, url, waitMs = 1800) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);
  await page.evaluate(async () => {
    window.scrollTo({ top: Math.min(700, document.body.scrollHeight), behavior: 'smooth' });
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(600);
}

async function completeFarmerOnboarding(page) {
  // Step 1
  const nameInput = page.getByPlaceholder('e.g. Green Valley Agro Estate');
  if (await nameInput.count()) {
    await narrate(page, 'New farmers complete an onboarding wizard. First we set the farm profile and certification.');
    await nameInput.fill('Green Valley Demo Farm');
    const size = page.locator('input[type="number"]').first();
    await size.fill('12');
    await page.getByPlaceholder('Describe your soil cultivation methods, organic standards, and irrigation sources...').fill(
      'Organic demonstration farm for AgroTrace walkthrough with drip irrigation.'
    );
    await page.getByRole('button', { name: /Next: Pin Location/i }).click();
    await page.waitForTimeout(1000);

    // Step 2 - location
    await narrate(page, 'Next we pin the farm location on the map for satellite NDVI and soil intelligence.');
    const search = page.getByPlaceholder(/Search city, district/i);
    if (await search.count()) {
      await search.fill('Nagpur');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }
    await page.getByRole('button', { name: /Next: Soil/i }).click();
    await page.waitForTimeout(2000);

    // Step 3 - soil (may auto-scan)
    await narrate(page, 'AgroTrace pulls soil chemistry telemetry. We continue to crop batch setup.');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Next: Configure Crop/i }).click();
    await page.waitForTimeout(1000);

    // Step 4 - crop
    await narrate(page, 'We register the first crop batch so yield AI and blockchain provenance can activate.');
    const variety = page.getByPlaceholder(/Sharbati|Pusa/i);
    if (await variety.count()) await variety.fill('Sharbati C-306');
    await page.getByRole('button', { name: /Complete Setup|Save & Update/i }).click();
    await page.waitForTimeout(4000);
  }
}

async function exploreFarmerTabs(page) {
  const tabs = [
    { name: /Farm Overview/i, say: 'Farm overview shows live weather telemetry and farm health.' },
    { name: /My Crops/i, say: 'Crops and Yield AI estimates production with the LightGBM regressor.' },
    { name: /Satellite NDVI/i, say: 'Satellite NDVI shows canopy health from remote sensing.' },
    { name: /AI Crop Advisory/i, say: 'AI crop advisory recommends what to plant next based on soil and climate.' },
    { name: /Orders/i, say: 'Orders and dispatch tracks consumer purchases ready for shipment.' },
  ];
  for (const t of tabs) {
    const btn = page.getByRole('button', { name: t.name });
    if (await btn.count()) {
      await narrate(page, t.say);
      await btn.first().click();
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
      await page.waitForTimeout(900);
    }
  }
}

async function run() {
  console.log('Starting AgroTrace narrated walkthrough...');
  console.log('Output:', OUT_DIR);

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  t0 = Date.now();

  // ===== LANDING =====
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await narrate(
    page,
    'Welcome to AgroTrace, also known as FarmConnect. This is a blockchain powered farm to table platform connecting farmers, distributors, and consumers.'
  );
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'smooth' }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 1600, behavior: 'smooth' }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(800);

  // ===== PUBLIC PAGES =====
  await narrate(page, 'Before logging in, anyone can browse the marketplace, verify harvests, and explore blockchain provenance.');
  await visitAndScroll(page, '/marketplace');
  await narrate(page, 'The marketplace lists verified farm produce with transparent pricing and distributor fees.');
  await visitAndScroll(page, '/verify');
  await narrate(page, 'Consumers can verify a harvest batch to confirm authenticity on the blockchain registry.');
  await visitAndScroll(page, '/blockchain');
  await narrate(page, 'The blockchain explorer shows ledger activity for supply chain events.');
  await visitAndScroll(page, '/weather');
  await narrate(page, 'Weather intelligence helps farmers plan irrigation and harvest windows.');
  await visitAndScroll(page, '/chatbot');
  await narrate(page, 'AgroBot AI answers farming and supply chain questions in natural language.');

  // ===== FARMER =====
  await narrate(
    page,
    `Now we create a brand new Farmer account for ${USERS.farmer.firstName} ${USERS.farmer.lastName}.`
  );
  await registerUser(page, USERS.farmer);
  await narrate(page, 'Farmer registration succeeded. The platform routes farmers to their farm dashboard.');
  await completeFarmerOnboarding(page);
  await narrate(page, 'Onboarding complete. Exploring the farmer dashboard features.');
  await exploreFarmerTabs(page);

  await narrate(page, 'Farmers can also open Weather AI, AgroBot, blockchain explorer, and the farm gallery from the dock.');
  await visitAndScroll(page, '/weather');
  await visitAndScroll(page, '/chatbot');
  await visitAndScroll(page, '/blockchain');
  await visitAndScroll(page, '/gallery');
  await visitAndScroll(page, '/marketplace');
  await narrate(page, 'That completes the farmer journey. Logging out to create a consumer account.');
  await logoutViaStorage(page);

  // ===== CONSUMER =====
  await narrate(
    page,
    `Creating a new Consumer account for ${USERS.consumer.firstName} ${USERS.consumer.lastName}.`
  );
  await registerUser(page, USERS.consumer);
  await narrate(page, 'Consumers land in the marketplace to browse and purchase farm produce.');
  await visitAndScroll(page, '/marketplace', 2200);

  // Try add to cart / buy now if products exist
  const addBtn = page.getByRole('button', { name: /Add to Cart/i });
  if (await addBtn.count()) {
    await narrate(page, 'Adding a product to the cart to demonstrate consumer purchasing.');
    await addBtn.first().click();
    await page.waitForTimeout(1500);
  } else {
    await narrate(page, 'No live products are listed yet, so we continue with verification and provenance tools.');
  }

  const buyBtn = page.getByRole('button', { name: /Buy Now/i });
  if (await buyBtn.count()) {
    await narrate(page, 'Buy Now opens secure checkout with shipping details.');
    await buyBtn.first().click();
    await page.waitForTimeout(2000);
    // close modal if open
    await safeClick(page, 'button:has-text("Secure Checkout") >> xpath=..');
    const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  await visitAndScroll(page, '/verify');
  await narrate(page, 'Here a consumer can paste a batch I D or scan QR style verification to confirm farm origin.');
  const verifyInput = page.locator('input').first();
  if (await verifyInput.count()) {
    await verifyInput.fill('DEMO-BATCH-001');
    await page.waitForTimeout(800);
    await safeClick(page, 'button:has-text("Verify"), button:has-text("Search"), button:has-text("Check")');
    await page.waitForTimeout(1500);
  }

  await visitAndScroll(page, '/chatbot');
  await narrate(page, 'Consumers can ask AgroBot about product freshness, farms, and traceability.');
  const chatInput = page.locator('textarea, input[type="text"]').last();
  if (await chatInput.count()) {
    await chatInput.fill('How does AgroTrace verify farm produce authenticity?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
  }

  await visitAndScroll(page, '/blockchain');
  await visitAndScroll(page, '/gallery');
  await narrate(page, 'Consumer walkthrough complete. Logging out for the distributor role.');
  await logoutViaStorage(page);

  // ===== DISTRIBUTOR =====
  await narrate(
    page,
    `Creating a new Distributor account for ${USERS.distributor.firstName} ${USERS.distributor.lastName}.`
  );
  await registerUser(page, USERS.distributor);
  await narrate(page, 'Distributors get a shipments hub to claim orders, update transit status, and record supply chain events.');
  await visitAndScroll(page, '/distributor/dashboard', 2500);

  await safeClick(page, 'button:has-text("Claim"), button:has-text("Available")');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});

  await narrate(page, 'Distributors can also browse the marketplace and inspect blockchain ledger entries.');
  await visitAndScroll(page, '/marketplace');
  await visitAndScroll(page, '/blockchain');
  await visitAndScroll(page, '/chatbot');

  await narrate(
    page,
    'That finishes the full AgroTrace walkthrough across farmer, consumer, and distributor roles. Thank you for watching.'
  );
  await page.waitForTimeout(1500);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  const meta = {
    stamp: STAMP,
    base: BASE,
    users: USERS,
    password: PASSWORD,
    cues,
    rawVideo: videoPath,
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'cues.json'), JSON.stringify(meta, null, 2));
  console.log('\nRaw video:', videoPath);
  console.log('Cues saved. Run mux-narration.mjs next.');
  return meta;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
