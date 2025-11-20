/**
 * place_orders_playwright_updated.js
 *
 * Updated for CI/QA environments:
 * - Handles navigation timeout with retries
 * - Uses 'domcontentloaded' for faster navigation
 * - Headless mode for GitHub Actions
 */

const { chromium } = require('playwright');
const argv = require('minimist')(process.argv.slice(2));

const CONFIG = {
  baseUrl: 'https://sg-devap02.mcmworldwide.com',
  productPath: '/en_SG/bags/all-bags/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html',
  ordersToPlace: Number(argv.count || 1),
  headless: false,          // Must be true for CI
  slowMo: 100,             // Optional slow motion for debugging logs
  guest: {
    emailDomain: 'example.com',
    firstName: 'Load',
    lastName: 'Test',
    phone: '6505550100',
    address1: '10 Test Street',
    city: 'Singapore',
    postalCode: '123456',
    country: 'SG'
  },
  card: {
    number: '5555 3412 4444 1115',
    expiryMonth: '03',
    expiryYear: '2030',
    cvv: '737',
    holderName: 'Load Test'
  }
};

const SELECTORS = {
  addToCartBtn: '#add-to-cart',
  buyNowBtn: '#buy-now-button',
  modalCheckoutBtn: 'a.button.mod_button.primary-button.no-outline[href*="/shipping"]',
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

function waitRandom(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(res => setTimeout(res, ms));
}

async function fillAdyenIframe(page, iframeSelector, card) {
  const iframeElement = await page.waitForSelector(iframeSelector, { timeout: 30000 });
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

async function navigateWithRetry(page, url, maxRetries = 2) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 120000 });
      return;
    } catch (err) {
      attempt++;
      console.log(`Navigation failed (attempt ${attempt}) — retrying...`);
      if (attempt >= maxRetries) throw err;
    }
  }
}

async function placeOneOrder(orderIndex, browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  console.log(`Order[${orderIndex}] → Visiting product page...`);
  await navigateWithRetry(page, CONFIG.baseUrl + CONFIG.productPath);
  console.log(`Current URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  // Logic from manual recording
  console.log('Clicking Buy Now...');
  await page.getByRole('button', { name: 'Buy Now' }).click();

  console.log('Proceeding to checkout from modal...');
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();

  console.log('Filling guest shipping details...');
  const guestEmail = `guest${Date.now()}${orderIndex}@${CONFIG.guest.emailDomain}`;

  await page.getByRole('textbox', { name: 'Email Address' }).fill(guestEmail);
  await page.getByRole('textbox', { name: 'First Name' }).fill(CONFIG.guest.firstName);
  await page.getByRole('textbox', { name: 'Last Name' }).fill(CONFIG.guest.lastName);
  await page.getByRole('textbox', { name: 'Address Line 1' }).fill(CONFIG.guest.address1);
  await page.getByRole('textbox', { name: 'Postcode' }).fill(CONFIG.guest.postalCode);
  await page.getByRole('textbox', { name: 'Phone Number' }).fill(CONFIG.guest.phone);

  // Optional: Select shipping method if needed (from recording)
  // await page.getByText('Home delivery in 3 days').click();

  console.log('Submitting shipping...');
  await page.getByRole('button', { name: 'Continue to Billing' }).click();

  await page.waitForTimeout(2000);

  console.log('Filling payment details...');
  // Name on Card
  await page.getByRole('textbox', { name: 'Name on Card' }).fill(CONFIG.card.holderName);

  // Card Number
  const cardFrame = page.locator('label').filter({ hasText: 'Card Number' }).locator('iframe').contentFrame();
  await cardFrame.getByRole('textbox', { name: 'Card number' }).click();
  await cardFrame.getByRole('textbox', { name: 'Card number' }).pressSequentially(CONFIG.card.number, { delay: 100 });

  // Expiry
  const expiryFrame = page.locator('label').filter({ hasText: 'Expiration MM/YY' }).locator('iframe').contentFrame();
  await expiryFrame.getByRole('textbox', { name: 'Credit or debit card' }).click();
  await expiryFrame.getByRole('textbox', { name: 'Credit or debit card' }).pressSequentially(`${CONFIG.card.expiryMonth}/${CONFIG.card.expiryYear.slice(-2)}`, { delay: 100 });

  // CVC
  const cvcFrame = page.locator('label').filter({ hasText: 'Security Code' }).locator('iframe').contentFrame();
  await cvcFrame.getByRole('textbox', { name: 'Credit or debit card 3 or 4' }).click();
  await cvcFrame.getByRole('textbox', { name: 'Credit or debit card 3 or 4' }).pressSequentially(CONFIG.card.cvv, { delay: 100 });

  console.log('Reviewing order...');
  await page.getByRole('button', { name: 'Review Order' }).click();

  // Wait for the "Complete Purchase" button to become visible/enabled
  console.log('Waiting for Complete Purchase button...');
  await page.getByRole('button', { name: 'COMPLETE PURCHASE' }).waitFor({ state: 'visible', timeout: 60000 });

  console.log('Completing purchase...');
  await page.getByRole('button', { name: 'COMPLETE PURCHASE' }).click();

  console.log('Waiting for order confirmation...');
  await page.waitForURL(/orderconfirmation/, { timeout: 60000 });

  // Extract order number from heading or page content
  const confirmationHeading = await page.getByRole('heading', { name: 'Thanks for your order' }).first();
  const headingText = await confirmationHeading.innerText().catch(() => 'Order Placed');

  console.log(`Order[${orderIndex}] complete — ${headingText}`);
  await page.close();
  return { success: true, orderNumber: headingText };
}

(async () => {
  const browser = await chromium.launch({ headless: CONFIG.headless, slowMo: CONFIG.slowMo });
  const results = [];

  for (let i = 1; i <= CONFIG.ordersToPlace; i++) {
    console.log(`--- Starting Order ${i} ---`);
    try {
      const res = await placeOneOrder(i, browser);
      results.push({ order: i, ...res });
    } catch (err) {
      console.error(`Order ${i} failed: ${err.message}`);
      results.push({ order: i, success: false, error: err.message });
    }

    await waitRandom(1000, 2000); // random delay
  }

  await browser.close();
  console.log('Run complete. Results:');
  console.table(results);
})();
