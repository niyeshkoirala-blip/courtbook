// Captures key UI screenshots to docs/screenshots/ using the seeded demo stack.
// Run the client (5173) + api (3000) with seed data, then: node scripts/shots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const PASSWORD = 'demo-password-1';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  await page.waitForTimeout(1300); // let fonts + reveal animations settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('✓', name);
};

const login = async (page, email) => {
  await page.goto(`${BASE}/auth/login`);
  await page.locator('#field-email').fill(email);
  await page.locator('#field-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/venues/);
};

const browser = await chromium.launch();
const ctx = () => browser.newContext({ viewport: { width: 1280, height: 800 } });

try {
  // ---- public (logged out) ----
  {
    const page = await (await ctx()).newPage();
    await page.goto(BASE);
    await shot(page, '01-landing-hero');
    await page.evaluate(() => window.scrollTo(0, 980));
    await shot(page, '02-landing-how-it-works');
    await page.goto(`${BASE}/auth/login`);
    await shot(page, '09-login');
    await page.goto(`${BASE}/auth/register`);
    await shot(page, '10-register');
    await page.context().close();
  }

  // ---- player ----
  {
    const page = await (await ctx()).newPage();
    await login(page, 'demo-player@courtbook.local');
    await page.goto(`${BASE}/venues`);
    await shot(page, '03-venues');

    // open Baneshwor Futsal Hub (seeded with open availability)
    await page.getByPlaceholder('Area, e.g. Baneshwor').fill('Baneshwor');
    await page
      .getByRole('link', { name: /Baneshwor Futsal Hub/ })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Baneshwor Futsal Hub' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 640));
    await shot(page, '04-venue-detail');

    // book a real slot -> checkout -> pay at venue -> confirmed
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      const slot = page.locator('[role=grid] button', { hasText: 'Rs' }).first();
      await slot.click();
      const bar = page.locator('.fixed.inset-x-0.bottom-0');
      await bar.getByRole('button', { name: /Book this slot|Book \d+ slot/ }).click();
      await page.waitForURL(/\/book\//, { timeout: 10000 });
      await shot(page, '05-checkout');
      await page.getByRole('button', { name: 'Pay at the venue' }).click();
      await page.getByRole('heading', { name: "You're booked!" }).waitFor({ timeout: 10000 });
      await shot(page, '06-booking-confirmed');
    } catch (e) {
      console.warn('! booking flow skipped:', e.message);
    }

    await page.goto(`${BASE}/me/bookings`);
    await shot(page, '07-my-bookings');

    // assistant widget
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Open assistant' }).click();
    await shot(page, '08-assistant');
    await page.context().close();
  }

  // ---- owner ----
  {
    const page = await (await ctx()).newPage();
    await login(page, 'demo-owner@courtbook.local');
    await page.goto(`${BASE}/owner`);
    await shot(page, '11-owner-dashboard');
    await page.goto(`${BASE}/owner/calendar`);
    await shot(page, '12-owner-calendar');
    await page.goto(`${BASE}/owner/reports`);
    await shot(page, '13-owner-reports');
    await page.context().close();
  }

  // ---- admin ----
  {
    const page = await (await ctx()).newPage();
    await login(page, 'demo-admin@courtbook.local');
    await page.goto(`${BASE}/admin`);
    await shot(page, '14-admin');
    await page.context().close();
  }
} finally {
  await browser.close();
}
console.log('\nDone → docs/screenshots/');
