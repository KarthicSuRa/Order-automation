/**
 * place_orders_playwright_50orders_retry.js
 *
 * High-speed automation for 50 orders with:
 * - Buy Now retries
 * - Safer concurrency
 * - Randomized delays
 * - City always Singapore
 */

const { chromium } = require('playwright');
const { faker } = require('@faker-js/faker');

const TOTAL_ORDERS = 50;
const CONCURRENCY = 10;  // safer initial concurrency
const BASE_URL = 'https://sg-devap02.mcmworldwide.com';

const PRODUCTS = [
    '/en_SG/bags/all-bags/stark-backpack-in-visetos/MMKFSVE05CO001.html?cgid=bags-all-bags',
    '/en_SG/bags/all-bags/dessau-drawstring-bag-in-visetos/MWDESDU03CO001.html?cgid=bags-all-bags',
    '/en_SG/lifestyle/home-leisure/mcm-park-doll-in-visetos/MELCSVD02CO001.html?cgid=lifestyle-home-leisure',
    '/en_SG/women/bags/shoulder-crossbody-bags/diamant-3d-shoulder-bag-in-visetos-leather-mix/MWSFSAK02CO001.html',
    '/en_SG/women/bags/totes-shoppers/reversible-liz-shopper-in-visetos/MWPCSVI02CO001.html',
    '/en_SG/gifts/gifts-for-her/claus-m-reversible-belt-1.75-in-visetos/MXBAAVI03CO001.html?cgid=gifts-gifts-for-her',
    '/en_SG/gifts/gifts-for-him/fursten-belt-bag-in-visetos/MMZAAFI01CO001.html?cgid=gifts-gifts-for-him',
    '/en_SG/women/wallets-small-leather-goods/all-wallets/himmel-trifold-wallet-in-lauretos/MYSEAAC01I9001.html?cgid=women-all-wallets',
    '/en_SG/women/bags/totes-shoppers/leni-shopper-in-visetos/MWPEATA021F001.html'
];

// Generate random Adyen test card
function generateCard(i) {
    const last4 = String(1000 + i).slice(-4);
    return {
        number: `5555 3412 4444 ${last4}`,
        expiryMonth: '03',
        expiryYear: '2030',
        cvv: String(700 + (i % 100)),
        holderName: `Load Test ${i}`
    };
}

// Generate unique guest info (city always Singapore)
function generateGuest(i) {
    return {
        email: `guest${Date.now()}_${i}@example.com`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        address1: `${faker.location.buildingNumber()} ${faker.location.street()}`,
        city: 'Singapore',
        postalCode: faker.location.zipCode(),
        phone: `650555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    };
}

// Random wait
function waitRandom(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(res => setTimeout(res, ms));
}

// Retry helper
async function retryClick(page, selector, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            await page.waitForSelector(selector, { timeout: 30000 });
            await page.click(selector);
            return true;
        } catch (err) {
            attempt++;
            console.log(`Retry ${attempt} for ${selector}...`);
            await waitRandom(500, 1500);
            if (attempt === maxRetries) throw err;
        }
    }
}

// Place a single order
async function placeOrder(orderIndex, browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        const productUrl = BASE_URL + PRODUCTS[orderIndex % PRODUCTS.length];
        await page.goto(productUrl, { waitUntil: 'load', timeout: 120000 });

        await retryClick(page, 'button:has-text("Buy Now")');
        await retryClick(page, 'a:has-text("Proceed to Checkout")');

        const guest = generateGuest(orderIndex);
        await page.getByRole('textbox', { name: 'Email Address' }).fill(guest.email);
        await page.getByRole('textbox', { name: 'First Name' }).fill(guest.firstName);
        await page.getByRole('textbox', { name: 'Last Name' }).fill(guest.lastName);
        await page.getByRole('textbox', { name: 'Address Line 1' }).fill(guest.address1);
        await page.getByRole('textbox', { name: 'Postcode' }).fill(guest.postalCode);
        await page.getByRole('textbox', { name: 'Phone Number' }).fill(guest.phone);
        await page.getByRole('textbox', { name: 'City' }).fill(guest.city);

        await retryClick(page, 'button:has-text("Continue to Billing")');
        await waitRandom(500, 1500);

        const card = generateCard(orderIndex);
        await page.getByRole('textbox', { name: 'Name on Card' }).fill(card.holderName);

        const cardFrame = page.locator('label:has-text("Card Number") iframe').first().contentFrame();
        await cardFrame?.getByRole('textbox').pressSequentially(card.number, { delay: 50 });

        const expiryFrame = page.locator('label:has-text("Expiration MM/YY") iframe').first().contentFrame();
        await expiryFrame?.getByRole('textbox').pressSequentially(`${card.expiryMonth}/${card.expiryYear.slice(-2)}`, { delay: 50 });

        const cvcFrame = page.locator('label:has-text("Security Code") iframe').first().contentFrame();
        await cvcFrame?.getByRole('textbox').pressSequentially(card.cvv, { delay: 50 });

        await retryClick(page, 'button:has-text("Review Order")');
        await page.getByRole('button', { name: 'COMPLETE PURCHASE' }).waitFor({ state: 'visible', timeout: 60000 });
        await retryClick(page, 'button:has-text("COMPLETE PURCHASE")');

        await page.waitForURL(/orderconfirmation/, { timeout: 60000 });
        const heading = await page.getByRole('heading', { name: 'Thanks for your order' }).first();
        const orderNumber = await heading.innerText().catch(() => 'Order Placed');

        console.log(`✅ Order[${orderIndex}] completed: ${orderNumber}`);
        await context.close();
        return { success: true, orderNumber, orderIndex };
    } catch (err) {
        console.log(`❌ Order[${orderIndex}] failed: ${err.message}`);
        await context.close();
        return { success: false, error: err.message, orderIndex };
    }
}

// Run orders with batch concurrency
async function runOrders() {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    let active = [];

    for (let i = 0; i < TOTAL_ORDERS; i++) {
        active.push(placeOrder(i + 1, browser));

        if (active.length >= CONCURRENCY) {
            const batch = await Promise.all(active);
            results.push(...batch);
            active = [];
            await waitRandom(1000, 2000);  // small pause between batches
        }
    }

    if (active.length > 0) {
        const batch = await Promise.all(active);
        results.push(...batch);
    }

    await browser.close();
    console.log('All orders completed:');
    console.table(results);
}

runOrders();
