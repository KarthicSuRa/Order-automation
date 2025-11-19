/**
 * place_orders_playwright.js
 *
 * Guest checkout automation for SFCC storefront.
 * Usage:
 *   node place_orders_playwright.js --count=1
 *   node place_orders_playwright.js --count=10
 *   node place_orders_playwright.js --count=100
 *
 * Prerequisites:
 *   npm install playwright minimist
 *   npx playwright install
 */

const { chromium } = require('playwright');
const argv = require('minimist')(process.argv.slice(2));

/* ========= CONFIG ========= */
const CONFIG = {
  baseUrl: 'https://sg-devap02.mcmworldwide.com',
  productPath: '/en_SG/bags/all-bags/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html',
  ordersToPlace: Number(argv.count || 1),
  headless: true,
  slowMo: 0,
  delayMinMs: 800,
  delayMaxMs: 2000,
  maxRetriesPerOrder: 2,
  guest: {
    emailDomain: 'qa-example.com',
    firstName: 'Load',
    lastName: 'Test',
    phone: '6505550100',
    address1: '10 Test Street',
    city: 'Singapore',
    postalCode: '123456',
    country: 'SG'
  },
  card: {
    number: '5454545454545454',
    expiryMonth: '03',
    expiryYear: '2030',
    cvv: '737',
    holderName: 'Load Test'
  }
};

/* ========= SELECTORS ========= */
const SELECTORS = {
  addToCartBtn: '#add-to-cart',
  checkoutButton: 'a[href*="/checkout"], button[name="checkout"], button[data-checkout]',
  shipping: {
    email: 'input[name="dwfrm_singleshipping_shippingAddress_email"]',
    firstName: 'input[name="dwfrm_singleshipping_shippingAddress_firstName"]',
    lastName: 'input[name="dwfrm_singleshipping_shippingAddress_lastName"]',
    address1: 'input[name="dwfrm_singleshipping_shippingAddress_address1"]',
    city: 'input[name="dwfrm_singleshipping_shippingAddress_city"]',
    postal: 'input[name="dwfrm_singleshipping_shippingAddress_postalCode"]',
    phone: 'input[name="dwfrm_singleshipping_shippingAddress_phone"]',
    continueBtn: 'button[name="dwfrm_singleshipping_save"], button#shippingContinue'
  },
  payment: {
    iframeSelector: 'iframe[src*="adyen"]',
    cardNumber: 'input[name="cardnumber"], input[id*="cardNumber"]',
    expiry: 'input[name="exp-date"], input[id*="cardExpiry"]',
    cvc: 'input[name="cvc"], input[id*="cardCvc"]',
    holderName: 'input[name="holderName"], input[name*="cardHolder"]',
    payButton: 'button[name="dwfrm_billing_save"], button#submitOrder, button.place-order'
  },
  orderConfirmation: {
    orderNumberSelector: 'div#order-number, .order-number, .thank-you-order-number'
  }
};

/* ========= UTILITIES ========= */
function waitRandom(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(res => setTimeout(res, ms));
}

async function fillAdyenIframe(page, iframeSelector, card) {
  const iframeElement = await page.waitForSelector(iframeSelector, { timeout: 10000 });
  const frame = await iframeElement.contentFrame();
  if (!frame) throw new Error('Cannot access payment iframe');

  if (await frame.$(SELECTORS.payment.cardNumber))
    await frame.fill(SELECTORS.payment.cardNumber, card.number);
  if (await frame.$(SELECTORS.payment.expiry))
    await frame.fill(SELECTORS.payment.expiry, `${card.expiryMonth}${card.expiryYear.slice(-2)}`);
  if (await frame.$(SELECTORS.payment.cvc))
    await frame.fill(SELECTORS.payment.cvc, card.cvv);
  if (await frame.$(SELECTORS.payment.holderName))
    await frame.fill(SELECTORS.payment.holderName, card.holderName);

  return true;
}

/* ========= PLACE ONE ORDER ========= */
async function placeOneOrder(orderIndex, browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const productUrl = CONFIG.baseUrl + CONFIG.productPath;
  console.log(`Order[${orderIndex}] → Visiting PDP: ${productUrl}`);
  await page.goto(productUrl, { waitUntil: 'networkidle' });

  // Add to cart
  const addBtn = await page.$(SELECTORS.addToCartBtn);
  if (!addBtn) throw new Error('Add to cart button not found');
  await addBtn.click();
  await page.waitForTimeout(1000);

  // Checkout
  let checkoutBtn = await page.$(SELECTORS.checkoutButton);
  if (!checkoutBtn) await page.goto(CONFIG.baseUrl + '/cart', { waitUntil: 'networkidle' });
  else await checkoutBtn.click();

  // Fill guest shipping
  const guestEmail = `guest+${Date.now()}+${orderIndex}@${CONFIG.guest.emailDomain}`;
  if (await page.$(SELECTORS.shipping.email)) await page.fill(SELECTORS.shipping.email, guestEmail);
  if (await page.$(SELECTORS.shipping.firstName)) await page.fill(SELECTORS.shipping.firstName, CONFIG.guest.firstName);
  if (await page.$(SELECTORS.shipping.lastName)) await page.fill(SELECTORS.shipping.lastName, CONFIG.guest.lastName);
  if (await page.$(SELECTORS.shipping.address1)) await page.fill(SELECTORS.shipping.address1, CONFIG.guest.address1);
  if (await page.$(SELECTORS.shipping.city)) await page.fill(SELECTORS.shipping.city, CONFIG.guest.city);
  if (await page.$(SELECTORS.shipping.postal)) await page.fill(SELECTORS.shipping.postal, CONFIG.guest.postalCode);
  if (await page.$(SELECTORS.shipping.phone)) await page.fill(SELECTORS.shipping.phone, CONFIG.guest.phone);
  if (await page.$(SELECTORS.shipping.continueBtn)) await page.click(SELECTORS.shipping.continueBtn);

  // Payment
  await page.waitForTimeout(1000);
  await fillAdyenIframe(page, SELECTORS.payment.iframeSelector, CONFIG.card);
  const payBtn = await page.$(SELECTORS.payment.payButton);
  if (!payBtn) throw new Error('Pay button not found');
  await Promise.all([
    payBtn.click(),
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{})
  ]);

  // Order number
  let orderNumber = null;
  if (await page.$(SELECTORS.orderConfirmation.orderNumberSelector)) {
    orderNumber = await page.$eval(SELECTORS.orderConfirmation.orderNumberSelector, el => el.innerText.trim()).catch(()=>null);
  }
  await page.close();
  return { success: true, orderNumber };
}

/* ========= MAIN RUNNER ========= */
(async () => {
  const total = CONFIG.ordersToPlace;
  console.log(`Starting guest checkout run — ${total} orders`);
  const browser = await chromium.launch({ headless: CONFIG.headless, slowMo: CONFIG.slowMo });

  const results = [];
  for (let i = 1; i <= total; i++) {
    let attempt = 0;
    let ok = false;
    let res = null;
    while (attempt <= CONFIG.maxRetriesPerOrder && !ok) {
      attempt++;
      try {
        console.log(`Placing order ${i} (attempt ${attempt})`);
        res = await placeOneOrder(i, browser);
        console.log(`Order ${i} placed — orderNumber: ${res.orderNumber || 'N/A'}`);
        ok = true;
      } catch (err) {
        console.error(`Order ${i} attempt ${attempt} failed: ${err.message}`);
        if (attempt > CONFIG.maxRetriesPerOrder) res = { success: false, error: err.message };
        else await new Promise(r => setTimeout(r, 2000));
      }
    }
    results.push({ order: i, ...res });
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * (CONFIG.delayMaxMs - CONFIG.delayMinMs + 1)) + CONFIG.delayMinMs));
  }

  await browser.close();
  console.log('Run complete. Results:');
  console.table(results);
})();
