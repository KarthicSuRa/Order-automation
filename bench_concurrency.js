const { chromium } = require("playwright");

async function benchmark(concurrency) {
    const browser = await chromium.launch({ headless: true });

    const start = Date.now();
    const promises = [];

    for (let i = 0; i < concurrency; i++) {
        promises.push(
            (async () => {
                const ctx = await browser.newContext();
                const page = await ctx.newPage();
                try {
                    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
                } catch (e) { }
                await ctx.close();
            })()
        );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    await browser.close();
    return duration;
}

(async () => {
    const levels = [1, 5, 10, 20, 30, 40, 50];
    for (const c of levels) {
        const time = await benchmark(c);
        console.log(`Concurrency ${c} → ${time} ms`);
    }
})();
