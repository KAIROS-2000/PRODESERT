import { expect, test } from '@playwright/test';

test.describe('Гостевой заказ с самовывозом', () => {
  test('гость ищет товар, оформляет самовывоз и видит ожидание проверки наличия', async ({
    page,
  }) => {
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: /каталог/i })).toBeVisible();

    await expect(
      page.getByRole('link', { name: 'Корзина, товаров: 0', exact: true }),
    ).toBeVisible();

    const productCard = page.locator('article').filter({
      has: page.locator('a[href="/product/shokolad-temnyy-professionalnyy-54-5-demo-1"]'),
    });
    await expect(productCard).toHaveCount(1);

    const addToCart = productCard.getByRole('button', { name: 'В корзину', exact: true });
    await expect(addToCart).toBeVisible();
    await addToCart.click();
    await expect(page.getByRole('link', { name: 'В корзине', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'В корзине', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
    await page.getByRole('link', { name: /перейти к оформлению/i }).click();
    await expect(page.getByRole('heading', { name: /оформление заказа/i })).toBeVisible();

    await page.getByLabel(/^Имя/).fill('Тестовый покупатель');
    await page.getByLabel(/^Телефон/).fill('+79990000001');
    await page.getByLabel(/^Email/).fill('e2e-guest@pro-dessert.test');
    await page.getByLabel(/согласен на обработку персональных данных/i).check();
    await page.getByLabel(/согласен с условиями заказа/i).check();
    await page.getByRole('button', { name: 'Оформить заказ' }).click();

    await expect(page).toHaveURL(/\/order\/success$/);
    await expect(page.getByRole('heading', { name: /начинаем проверку наличия/i })).toBeVisible();
    await expect(
      page.locator('#main-content').getByText('Самовывоз', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('AWAITING_STOCK_CONFIRMATION', { exact: true })).toBeVisible();
  });

  test('клавиатурная навигация открывает skip-link и служебные страницы не индексируются', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();

    await page.goto('/cart');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});
