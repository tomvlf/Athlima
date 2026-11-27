import { test, expect } from '@playwright/test';

test.describe('Athlima critical browser journeys', () => {
    test('loads the dashboard and switches routes', async ({page}) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Too Many Watts/);
        await expect(page.locator('#platform')).toBeVisible();
        await expect(page.locator('#main-content')).toBeVisible();

        await page.goto('/#/library');
        await expect(page).toHaveURL(/#\/library$/);
        await expect(page.locator('#route-title')).toContainText('Workout library');

        await page.goto('/#/calendar');
        await expect(page).toHaveURL(/#\/calendar$/);
        await expect(page.locator('#route-title')).toContainText('Training calendar');
    });

    test('uses the mobile navigation below the 701-pixel breakpoint', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/');
        await expect(page.locator('body')).toHaveClass(/mobile-app/);
        await expect(page.locator('.sidebar nav')).toBeVisible();
        await expect(page.locator('.sidebar nav [data-tab="ride"], .sidebar nav [data-tab="player"]')).toBeVisible();
    });

    test('keeps the desktop shell above the mobile breakpoint', async ({page}) => {
        await page.setViewportSize({width: 1024, height: 768});
        await page.goto('/');
        await expect(page.locator('body')).not.toHaveClass(/mobile-app/);
        await expect(page.locator('.sidebar')).toBeVisible();
    });
});
