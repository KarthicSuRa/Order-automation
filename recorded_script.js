import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://sg-devap02.mcmworldwide.com/en_SG/men/bags/backpacks/stark-backpack-in-maxi-monogram-leather/MMKDAVE02VC001.html');
  await page.getByRole('button', { name: 'Buy Now' }).click();
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).click();
  await page.getByRole('textbox', { name: 'First Name' }).click();
  await page.getByRole('textbox', { name: 'Last Name' }).click();
  await page.getByRole('textbox', { name: 'Address Line 1' }).click();
  await page.getByRole('textbox', { name: 'Postcode' }).click();
  await page.getByRole('textbox', { name: 'Phone Number' }).click();
  await page.getByText('Home delivery in 3 days Free Monday-Friday(except bank holidays) On all orders').click();
  await page.getByRole('button', { name: 'Continue to Billing' }).click();
});