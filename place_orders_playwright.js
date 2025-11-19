/**
 * place_orders_playwright_debug.js
 *
 * Debug version for SFCC guest checkout.
 * Visual, step-by-step verification of basket → checkout → payment → order.
 *
 * Usage:
 *   node place_orders_playwright_debug.js --count=1
 */

const { chromium } = require('playwright');
const argv = require('minimist')(process.argv.slice(2));

const CONFIG = {
  baseUrl: 'https://sg-devap02.mcmworldwide.com',
  productPath: '/en_SG/bags/all-bags/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html',
  ordersToPlace: Number(argv.count || 1),
  headless: true,  // Run in visible mode
  slowMo: 500,      // Slow down actions for visual check
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

function waitRandom(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(res => setTimeout(res, ms));
}

async function fillAdyenIframe(page, iframeSelector, card) {
  console.log('Filling payment iframe...');
  const iframeElement = await page.waitForSelector(iframeSelector, { timeout: 10000 });
  const frame = await iframeElement.contentFrame();
  if (!frame) throw new Error('Cannot access payment iframe');

  console.log('Entering card number...');
  if (await frame.$(SELECTORS.payment.cardNumber))
    await frame.fill(SELECTORS.payment.cardNumber, card.number);

  console.log('Entering expiry...');
  if (await frame.$(SELECTORS.payment.expiry))
    await frame.fill(SELECTORS.payment.expiry, `${card.expiryMonth}${card.expiryYear.slice(-2)}`);

  console.log('Entering CVV...');
  if (await frame.$(SELECTORS.payment.cvc))
    await frame.fill(SELECTORS.payment.cvc, card.cvv);

  console.log('Entering card holder name...');
  if (await frame.$(SELECTORS.payment.holderName))
    await frame.fill(SELECTORS.payment.holderName, card.holderName);

  return true;
}

async function placeOneOrder(orderIndex, browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  console.log(`Order[${orderIndex}] → Visiting product page...`);
  await page.goto(CONFIG.baseUrl + CONFIG.productPath, { waitUntil: 'networkidle' });

  console.log('Clicking Add to Cart...');
  const addBtn = await page.$(SELECTORS.addToCartBtn);
  if (!addBtn) throw new Error('Add to cart button not found');
  await addBtn.click();

  await page.waitForTimeout(1000);

  console.log('Proceeding to checkout...');
  let checkoutBtn = await page.$(SELECTORS.checkoutButton);
  if (!checkoutBtn) await page.goto(CONFIG.baseUrl + '/cart', { waitUntil: 'networkidle' });
  else await checkoutBtn.click();

  console.log('Filling guest shipping details...');
  const guestEmail = `guest+${Date.now()}+${orderIndex}@${CONFIG.guest.emailDomain}`;
  if (await page.$(SELECTORS.shipping.email)) await page.fill(SELECTORS.shipping.email, guestEmail);
  if (await page.$(SELECTORS.shipping.firstName)) await page.fill(SELECTORS.shipping.firstName, CONFIG.guest.firstName);
  if (await page.$(SELECTORS.shipping.lastName)) await page.fill(SELECTORS.shipping.lastName, CONFIG.guest.lastName);
  if (await page.$(SELECTORS.shipping.address1)) await page.fill(SELECTORS.shipping.address1, CONFIG.guest.address1);
  if (await page.$(SELECTORS.shipping.city)) await page.fill(SELECTORS.shipping.city, CONFIG.guest.city);
  if (await page.$(SELECTORS.shipping.postal)) await page.fill(SELECTORS.shipping.postal, CONFIG.guest.postalCode);
  if (await page.$(SELECTORS.shipping.phone)) await page.fill(SELECTORS.shipping.phone, CONFIG.guest.phone);
  if (await page.$(SELECTORS.shipping.continueBtn)) await page.click(SELECTORS.shipping.continueBtn);

  await page.waitForTimeout(2000);

  await fillAdyenIframe(page, SELECTORS.payment.iframeSelector, CONFIG.card);

  console.log('Submitting payment...');
  const payBtn = await page.$(SELECTORS.payment.payButton);
  if (!payBtn) throw new Error('Pay button not found');
  await Promise.all([
    payBtn.click(),
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{})
  ]);

  console.log('Fetching order confirmation...');
  let orderNumber = null;
  if (await page.$(SELECTORS.orderConfirmation.orderNumberSelector)) {
    orderNumber = await page.$eval(SELECTORS.orderConfirmation.orderNumberSelector, el => el.innerText.trim()).catch(()=>null);
  }

  console.log(`Order[${orderIndex}] complete — Order Number: ${orderNumber || 'N/A'}`);
  await page.close();
  return { success: true, orderNumber };
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
