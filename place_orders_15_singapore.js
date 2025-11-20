/**
 * place_orders_15_singapore.js
 * 
 * 15 orders with concurrency 15
 * Using single valid card: 5555 3412 4444 1115
 */

const { chromium } = require('playwright');
const { faker } = require('@faker-js/faker');

// CONFIG
const TOTAL_ORDERS = 15;
const CONCURRENCY = 15;
const BATCH_DELAY = 3000;
const BASE_URL = 'https://sg-devap02.mcmworldwide.com';
const PRODUCT_PATH = '/en_SG/bags/all-bags/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html';

// Generate card - single valid card for all orders
function generateCard(i) {
    return {
        number: '5555 3412 4444 1115',
        expiryMonth: '03',
        expiryYear: '2030',
        cvv: '737',
        holderName: `Load Test ${i}`
    };
}

// Generate unique guest info
function generateGuest(i) {
    const postalCode = String(100000 + Math.floor(Math.random() * 800000));

    return {
        email: `guest${Date.now()}_${i}@example.com`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        address1: `${faker.location.buildingNumber()} ${faker.location.street()}`,
        city: 'Singapore',
        postalCode: postalCode,
        phone: `650555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    };
}

// Place a single order
async function placeOrder(orderIndex, browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-SG',
        timezoneId: 'Asia/Singapore',
        extraHTTPHeaders: {
            'Accept-Language': 'en-SG,en;q=0.9',
        }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        console.log(`[${orderIndex}] Navigating to product...`);
        await page.goto(BASE_URL + PRODUCT_PATH, { waitUntil: 'load', timeout: 120000 });

        console.log(`[${orderIndex}] Clicking Buy Now...`);
        await page.getByRole('button', { name: 'Buy Now' }).click();

        console.log(`[${orderIndex}] Proceeding to checkout...`);
        await page.getByRole('link', { name: 'Proceed to Checkout' }).click();

        // Guest info
        const guest = generateGuest(orderIndex);
        await page.getByRole('textbox', { name: 'Email Address' }).fill(guest.email);
        await page.getByRole('textbox', { name: 'First Name' }).fill(guest.firstName);
        await page.getByRole('textbox', { name: 'Last Name' }).fill(guest.lastName);
        await page.getByRole('textbox', { name: 'Address Line 1' }).fill(guest.address1);
        await page.getByRole('textbox', { name: 'Postcode' }).fill(guest.postalCode);
        await page.getByRole('textbox', { name: 'Phone Number' }).fill(guest.phone);

        await page.getByRole('button', { name: 'Continue to Billing' }).click();
        await page.waitForTimeout(5000);

        // Payment
        const card = generateCard(orderIndex);
        await page.getByRole('textbox', { name: 'Name on Card' }).fill(card.holderName);

        // Card Number
        const cardFrame = page.locator('label').filter({ hasText: 'Card Number' }).locator('iframe').contentFrame();
        await cardFrame.getByRole('textbox', { name: 'Card number' }).click();
        await cardFrame.getByRole('textbox', { name: 'Card number' }).pressSequentially(card.number, { delay: 100 });

        // Expiry
        const expiryFrame = page.locator('label').filter({ hasText: 'Expiration MM/YY' }).locator('iframe').contentFrame();
        await expiryFrame.getByRole('textbox', { name: 'Credit or debit card' }).click();
        await expiryFrame.getByRole('textbox', { name: 'Credit or debit card' }).pressSequentially(`${card.expiryMonth}/${card.expiryYear.slice(-2)}`, { delay: 100 });

        // CVC
        const cvcFrame = page.locator('label').filter({ hasText: 'Security Code' }).locator('iframe').contentFrame();
        await cvcFrame.getByRole('textbox', { name: 'Credit or debit card 3 or 4' }).click();
        await cvcFrame.getByRole('textbox', { name: 'Credit or debit card 3 or 4' }).pressSequentially(card.cvv, { delay: 100 });

        // Review & complete
        await page.getByRole('button', { name: 'Review Order' }).click();
        await page.getByRole('button', { name: 'COMPLETE PURCHASE' }).waitFor({ state: 'visible', timeout: 60000 });
        await page.getByRole('button', { name: 'COMPLETE PURCHASE' }).click();

        await page.waitForURL(/orderconfirmation/, { timeout: 60000 });
        const confirmationHeading = await page.getByRole('heading', { name: 'Thanks for your order' }).first();
        const orderNumber = await confirmationHeading.innerText().catch(() => 'Order Placed');

        console.log(`✅ Order[${orderIndex}] completed: ${orderNumber}`);
        await context.close();
        return { success: true, orderNumber, orderIndex };
    } catch (err) {
        console.log(`❌ Order[${orderIndex}] failed: ${err.message}`);
        await context.close();
        return { success: false, error: err.message, orderIndex };
    }
}

// Run orders with concurrency
async function runOrders() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });

    const results = [];
    let active = [];
    let batchCount = 0;

    for (let i = 0; i < TOTAL_ORDERS; i++) {
        active.push(placeOrder(i + 1, browser));

        if (active.length >= CONCURRENCY || i === TOTAL_ORDERS - 1) {
            batchCount++;
            console.log(`\n🚀 Starting batch ${batchCount} with ${active.length} orders...`);

            const batch = await Promise.all(active);
            results.push(...batch);
            active = [];

            if (i < TOTAL_ORDERS - 1) {
                console.log(`⏳ Waiting ${BATCH_DELAY}ms before next batch...\n`);
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
    }

    await browser.close();

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY: ${successCount} successful, ${failCount} failed`);
    console.log('='.repeat(60));
    console.table(results);
}

runOrders();
