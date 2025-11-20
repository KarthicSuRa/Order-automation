/**
 * place_orders_github_actions.js
 * 
 * Optimized for GitHub Actions parallel execution
 * Each job runs 5 orders sequentially
 */

const { chromium } = require('playwright');
const fs = require('fs');

// Faker will be loaded dynamically to support ESM
let faker;

// CONFIG from environment variables
const JOB_NUMBER = parseInt(process.env.JOB_NUMBER || '1');
const ORDERS_PER_JOB = parseInt(process.env.ORDERS_PER_JOB || '5');
const TOTAL_JOBS = parseInt(process.env.TOTAL_JOBS || '20');

const BASE_URL = 'https://sg-devap02.mcmworldwide.com';
const PRODUCT_PATH = '/en_SG/bags/all-bags/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html';

// Generate card - single valid card
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
function generateGuest(orderNumber) {
    const postalCode = String(100000 + Math.floor(Math.random() * 800000));

    return {
        email: `github_job${JOB_NUMBER}_order${orderNumber}_${Date.now()}@example.com`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        address1: `${faker.location.buildingNumber()} ${faker.location.street()}`,
        city: 'Singapore',
        postalCode: postalCode,
        phone: `650555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    };
}

// Place a single order
async function placeOrder(orderNumber, browser) {
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

    const startTime = Date.now();

    try {
        console.log(`[Job ${JOB_NUMBER}, Order ${orderNumber}] Starting...`);

        await page.goto(BASE_URL + PRODUCT_PATH, { waitUntil: 'load', timeout: 120000 });
        await page.getByRole('button', { name: 'Buy Now' }).click();
        await page.getByRole('link', { name: 'Proceed to Checkout' }).click();

        // Guest info
        const guest = generateGuest(orderNumber);
        await page.getByRole('textbox', { name: 'Email Address' }).fill(guest.email);
        await page.getByRole('textbox', { name: 'First Name' }).fill(guest.firstName);
        await page.getByRole('textbox', { name: 'Last Name' }).fill(guest.lastName);
        await page.getByRole('textbox', { name: 'Address Line 1' }).fill(guest.address1);
        await page.getByRole('textbox', { name: 'Postcode' }).fill(guest.postalCode);
        await page.getByRole('textbox', { name: 'Phone Number' }).fill(guest.phone);

        await page.getByRole('button', { name: 'Continue to Billing' }).click();
        await page.waitForTimeout(5000);

        // Payment
        const card = generateCard(orderNumber);
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
        const orderConfirmation = await confirmationHeading.innerText().catch(() => 'Order Placed');

        const duration = Date.now() - startTime;

        console.log(`✅ [Job ${JOB_NUMBER}, Order ${orderNumber}] Success in ${duration}ms: ${orderConfirmation}`);

        await context.close();
        return {
            success: true,
            jobNumber: JOB_NUMBER,
            orderNumber: orderNumber,
            confirmation: orderConfirmation,
            duration: duration,
            email: guest.email
        };
    } catch (err) {
        const duration = Date.now() - startTime;
        console.log(`❌ [Job ${JOB_NUMBER}, Order ${orderNumber}] Failed in ${duration}ms: ${err.message}`);

        await context.close();
        return {
            success: false,
            jobNumber: JOB_NUMBER,
            orderNumber: orderNumber,
            error: err.message,
            duration: duration
        };
    }
}

// Run orders for this job
async function runJob() {
    console.log(`\n🚀 GitHub Actions Job ${JOB_NUMBER}/${TOTAL_JOBS}`);
    console.log(`📦 Placing ${ORDERS_PER_JOB} orders sequentially`);
    console.log('='.repeat(60));

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });

    const results = [];
    const jobStartTime = Date.now();

    for (let i = 1; i <= ORDERS_PER_JOB; i++) {
        const orderNumber = (JOB_NUMBER - 1) * ORDERS_PER_JOB + i;
        const result = await placeOrder(orderNumber, browser);
        results.push(result);

        // Small delay between orders
        if (i < ORDERS_PER_JOB) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    await browser.close();

    const jobDuration = Date.now() - jobStartTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Job ${JOB_NUMBER} Summary:`);
    console.log(`   ✅ Success: ${successCount}/${ORDERS_PER_JOB}`);
    console.log(`   ❌ Failed: ${failCount}/${ORDERS_PER_JOB}`);
    console.log(`   ⏱️  Total time: ${(jobDuration / 1000).toFixed(2)}s`);
    console.log('='.repeat(60));

    // Save results to file
    const output = {
        jobNumber: JOB_NUMBER,
        totalJobs: TOTAL_JOBS,
        ordersPerJob: ORDERS_PER_JOB,
        successCount: successCount,
        failCount: failCount,
        duration: jobDuration,
        results: results
    };

    fs.writeFileSync(`results-job-${JOB_NUMBER}.json`, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to results-job-${JOB_NUMBER}.json`);

    // Exit with error code if any orders failed
    if (failCount > 0) {
        process.exit(1);
    }
}

runJob().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
