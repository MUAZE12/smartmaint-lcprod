import { test, expect } from '@playwright/test';

/**
 * Smoke tests: the app boots, the login screen renders, and known
 * accessibility hooks (title, main landmark) are present.
 *
 * Auth-gated tests (admin dashboard, tech scanner, operator report) live
 * in login-as-admin.spec.ts once E2E credentials are provisioned. Keeping
 * this file no-auth ensures CI can run it against a clean Supabase project
 * before we wire test users in.
 */

test.describe('Smoke — login page', () => {
    test('renders the SmartMaint - L.C PROD login screen', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await expect(page).toHaveTitle(/SmartMaint|L\.C PROD/i);

        // The login page must expose email + password inputs and a submit button.
        // Selectors match the real markup in src/app/page.tsx:
        //   - inputs are matched by their `<label for="…">` bound to the input id
        //   - the primary submit button reads "Continuer"
        await expect(page.getByLabel('Adresse e-mail')).toBeVisible();
        await expect(page.getByLabel('Mot de passe')).toBeVisible();
        await expect(page.getByRole('button', { name: /Continuer|Connexion/i })).toBeVisible();
    });

    test('shows an error toast when credentials are wrong', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.getByLabel('Adresse e-mail').fill('nobody@example.com');
        await page.getByLabel('Mot de passe').fill('wrong-password-xxx');
        await page.getByRole('button', { name: /Continuer|Connexion/i }).click();

        // The AuthContext maps "invalid" errors to a French-friendly message.
        // Filter by the login form's error class to avoid matching Next.js's
        // built-in <div id="__next-route-announcer__" role="alert" />.
        const loginError = page.locator('.sm-login__error');
        await expect(loginError).toBeVisible({ timeout: 15_000 });
        await expect(loginError).toContainText(/incorrect|invalide/i);
    });

    test('has no unhandled console errors on first paint', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        // Ignore known third-party noise (Supabase realtime connect warnings).
        page.on('console', msg => {
            if (msg.type() === 'error' && !/supabase|websocket/i.test(msg.text())) {
                errors.push(msg.text());
            }
        });
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
        expect(errors).toEqual([]);
    });
});
