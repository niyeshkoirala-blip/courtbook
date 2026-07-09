import { test, expect, type Page } from '@playwright/test';

/**
 * Critical player + owner journeys (blueprint §11) against the live stack with
 * seed data. Uses the seeded, pre-verified demo accounts so the flow doesn't
 * depend on the email-verification step (covered by API integration tests).
 *
 * Seed accounts (password demo-password-1): demo-player@ / demo-owner@courtbook.local
 */

const PASSWORD = 'demo-password-1';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/venues/);
}

test('player books a slot end-to-end and cancels it', async ({ page }) => {
  await login(page, 'demo-player@courtbook.local');

  // find the seeded venue via search
  await page.getByPlaceholder('Area, e.g. Baneshwor').fill('Baneshwor');
  await page
    .getByRole('link', { name: /Baneshwor Futsal Hub/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Baneshwor Futsal Hub' })).toBeVisible();

  // pick the first available slot → sticky booking bar appears
  await page.locator('[role=gridcell][tabindex="0"]').first().click();
  const bookBar = page.locator('.fixed.inset-x-0.bottom-0');
  await expect(bookBar).toBeVisible();
  await bookBar.getByRole('button', { name: 'Book this slot' }).click();

  // checkout → pay at venue → confirmed
  await expect(page).toHaveURL(/\/book\//);
  await expect(page.getByText(/Slot held for/)).toBeVisible();
  await page.getByRole('button', { name: 'Pay at the venue' }).click();
  await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();

  // my bookings → cancel
  await page.getByRole('link', { name: 'My bookings' }).first().click();
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText(/cancelled/i).first()).toBeVisible();
});

test('owner sees the dashboard and can open the walk-in modal', async ({ page }) => {
  await login(page, 'demo-owner@courtbook.local');
  await page.goto('/owner');

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Revenue today')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Owner' })).toBeVisible();

  await page.getByRole('button', { name: 'New walk-in' }).click();
  await expect(page.getByRole('heading', { name: 'New walk-in' })).toBeVisible();
});

test('assistant widget opens and reports its disabled state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open assistant' }).click();
  await page.getByLabel('Message the assistant').fill('any courts free tomorrow?');
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  // LLM_API_KEY unset → friendly disabled message (not an error)
  await expect(page.getByText(/not switched on yet/)).toBeVisible();
});
