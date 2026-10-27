import { expect, test } from '@playwright/test';

test('foundation page keeps the safety boundary, API proxy, and public report placeholder usable', async ({
  page,
}) => {
  await page.goto('/');

  const safetyNotice = page.getByRole('note', { name: 'Prototype safety notice' });
  await expect(safetyNotice).toContainText('Hackathon prototype — not an emergency service.');
  await expect(safetyNotice.getByRole('link', { name: /call 112/i })).toHaveAttribute(
    'href',
    'tel:112',
  );
  await expect(page.getByRole('status')).toContainText('Local API reachable');

  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation.getByRole('link', { name: 'Staff sign-in' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Operator workspace' })).toHaveCount(0);
  await expect(navigation.getByRole('link', { name: 'Responder workspace' })).toHaveCount(0);
  await expect(navigation.getByRole('link', { name: 'Administration' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Report', exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole('heading', { name: 'Report an emergency' })).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Demonstration note (not sent or saved)' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /submit|send/i })).toHaveCount(0);
});

test('direct staff URLs redirect public visitors to sign-in without exposing self-registration', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Staff sign-in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /register|sign up/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /register|sign up/i })).toHaveCount(0);
});
