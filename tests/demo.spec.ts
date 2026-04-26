import { test, expect, type Page } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


const STATE = '[data-testid="feature-state"]';
const TRIGGER = '[data-testid="payment-trigger"]';
const POPOVER = '[data-testid="payment-popover"]';
const MULTI_T1 = '[data-testid="multi-trigger-1"]';
const MULTI_T2 = '[data-testid="multi-trigger-2"]';
const MULTI_P1 = '[data-testid="multi-popover-1"]';
const MULTI_P2 = '[data-testid="multi-popover-2"]';
const CE_TRIGGER = '[data-testid="custom-element-trigger"]';
const CE_MOUNT = '[data-testid="custom-element-mount"]';
const SK_TRIGGER = '[data-testid="skeleton-trigger"]';
const SK_POPOVER = '[data-testid="skeleton-popover"]';
const SK_PLACEHOLDER = '[data-testid="skeleton-placeholder"]';
const UPD_POPOVER = '[data-testid="update-popover"]';
const UPD_MOUNT_BTN = '[data-testid="update-mount-btn"]';
const UPD_CHANGE_BTN = '[data-testid="update-change-btn"]';
const UPD_UNMOUNT_BTN = '[data-testid="update-unmount-btn"]';
const CE_CHANGE_BTN = '[data-testid="ce-change-props-btn"]';
const LB_TRIGGER = '[data-testid="lightbox-trigger"]';
const LB_MOUNT = '[data-testid="lightbox-mount"]';

async function popoverHasContent(page: Page, selector: string): Promise<boolean> {
  return page.locator(`${selector} > *`).count().then((n) => n > 0);
}

test.describe("mountly demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the bundle to wire everything up.
    await expect(page.locator(STATE)).toHaveText("idle");
  });

  test("hover preloads the module without mounting", async ({ page }) => {
    await page.locator(TRIGGER).hover();
    // hover preload has a 100ms delay
    await expect(page.locator(STATE)).toHaveText(/preloaded|preloading/, {
      timeout: 2000,
    });
    // Popover container stays empty while merely preloading.
    await expect(page.locator(`${POPOVER} > *`)).toHaveCount(0);
  });

  test("click activates, mounts, and renders payment data", async ({ page }) => {
    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("mounted", { timeout: 5000 });
    await expect(page.locator(POPOVER)).toContainText("Total due");
    await expect(page.locator(POPOVER)).toContainText("$149.99");
    await expect(page.locator(POPOVER)).toContainText("Pro Plan (Monthly)");
  });

  test("clicking the trigger again unmounts the popover", async ({ page }) => {
    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("mounted", { timeout: 5000 });

    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("activated", { timeout: 5000 });
    await expect(page.locator(POPOVER)).not.toContainText("Total due");
  });

  test("close button (×) dismisses the popover", async ({ page }) => {
    await page.locator(TRIGGER).click();
    await expect(page.locator(POPOVER)).toContainText("Total due");

    await page.locator(`${POPOVER} button`).click();
    await expect(page.locator(`${POPOVER} > *`)).toHaveCount(0);
  });

  test("multi-instance: each trigger renders its own paymentId", async ({ page }) => {
    await page.locator(MULTI_T1).click();
    await expect(page.locator(MULTI_P1)).toContainText("$149.99");

    await page.locator(MULTI_T2).click();
    await expect(page.locator(MULTI_P2)).toContainText("€49.00");

    // Both remain mounted independently.
    expect(await popoverHasContent(page, MULTI_P1)).toBe(true);
    expect(await popoverHasContent(page, MULTI_P2)).toBe(true);

    // Different items rendered, not cross-pollinated.
    await expect(page.locator(MULTI_P1)).toContainText("Pro Plan");
    await expect(page.locator(MULTI_P2)).toContainText("Starter Plan");
  });

  test("host skeleton is cleared on mount and reserved space prevents shift", async ({ page }) => {
    // Placeholder is visible before interaction
    await expect(page.locator(SK_PLACEHOLDER)).toBeVisible();

    // Capture reserved footprint
    const before = await page.locator(SK_POPOVER).boundingBox();
    expect(before?.width).toBeGreaterThanOrEqual(320);
    expect(before?.height).toBeGreaterThanOrEqual(240);

    await page.locator(SK_TRIGGER).click();
    await expect(page.locator(SK_POPOVER)).toContainText("Total due");

    // Host placeholder gone (cleared by mount)
    await expect(page.locator(SK_PLACEHOLDER)).toHaveCount(0);

    // Reserved space still honored after mount (host-owned inline style)
    const after = await page.locator(SK_POPOVER).boundingBox();
    expect(after?.width).toBeGreaterThanOrEqual(320);
  });

  test("feature.update() changes props without remount", async ({ page }) => {
    await page.locator(UPD_MOUNT_BTN).click();
    await expect(page.locator(UPD_POPOVER)).toContainText("$10.00");
    await expect(page.locator(UPD_POPOVER)).toContainText("Seat");

    await page.locator(UPD_CHANGE_BTN).click();
    await expect(page.locator(UPD_POPOVER)).toContainText("$15.00");
    await expect(page.locator(UPD_POPOVER)).toContainText("Seat ×2");

    await page.locator(UPD_CHANGE_BTN).click();
    await expect(page.locator(UPD_POPOVER)).toContainText("$20.00");

    // After unmount, the slot is clean.
    await page.locator(UPD_UNMOUNT_BTN).click();
    await expect(page.locator(UPD_POPOVER)).not.toContainText("Payment Breakdown");
  });

  test("custom element re-renders when props attribute changes", async ({ page }) => {
    // Mount via hover first.
    await page.locator(CE_TRIGGER).hover();
    await expect(page.locator(CE_MOUNT)).toContainText("Hosted plan");
    await expect(page.locator(CE_MOUNT)).toContainText("$99.00");

    // Flip the attribute and expect the mounted widget to reconcile.
    await page.locator(CE_CHANGE_BTN).click();
    await expect(page.locator(CE_MOUNT)).toContainText("Updated plan");
    await expect(page.locator(CE_MOUNT)).toContainText("£250.00");
    await expect(page.locator(CE_MOUNT)).not.toContainText("Hosted plan");
  });

  test("custom element mounts on hover with props.data", async ({ page }) => {
    await page.locator(CE_TRIGGER).hover();
    // hover-to-activate (no delay), should render quickly
    // The shadow root contains a <style> tag plus the React mount div,
    // so check for rendered content rather than a fixed child count.
    await expect(page.locator(CE_MOUNT)).toContainText("Hosted plan", {
      timeout: 5000,
    });
    await expect(page.locator(CE_MOUNT)).toContainText("$99.00");
  });

  test("module is loaded once across instances (network dedup)", async ({ page }) => {
    const moduleRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("payment-breakdown") && url.endsWith(".js")) {
        moduleRequests.push(url);
      }
    });

    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("mounted", { timeout: 5000 });

    await page.locator(TRIGGER).click(); // toggle off
    await expect(page.locator(STATE)).toHaveText("activated");

    await page.locator(MULTI_T1).click();
    await expect(page.locator(MULTI_P1)).toContainText("Total");

    // The page-shell already loaded the module before our listener attached
    // (it was bundled in main.ts). What matters is that triggering features
    // doesn't fire additional module requests.
    expect(moduleRequests.length).toBeLessThanOrEqual(1);
  });

  test("data is fetched once per paymentId (cache dedup)", async ({ page }) => {
    const dataRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/payments/")) dataRequests.push(url);
    });

    // Click pay_123 twice (mount → unmount → mount again)
    await page.locator(MULTI_T1).click();
    await expect(page.locator(MULTI_P1)).toContainText("Total");
    await page.locator(MULTI_T1).click(); // unmount
    await expect(page.locator(MULTI_P1)).not.toContainText("Total");
    await page.locator(MULTI_T1).click(); // mount again — should use cache
    await expect(page.locator(MULTI_P1)).toContainText("Total");

    // Click pay_456 once
    await page.locator(MULTI_T2).click();
    await expect(page.locator(MULTI_P2)).toContainText("Total");

    const pay123 = dataRequests.filter((u) => u.endsWith("/pay_123"));
    const pay456 = dataRequests.filter((u) => u.endsWith("/pay_456"));
    expect(pay123).toHaveLength(1);
    expect(pay456).toHaveLength(1);
  });

  test("payment breakdown is an accessible dialog and closes on Escape", async ({ page }) => {
    test.setTimeout(20000);
    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("mounted", { timeout: 5000 });

    // Wait for the shadow content to render the dialog before asserting.
    // page.locator pierces shadow roots; waitFor polls until the element appears.
    await page.locator(`${POPOVER} [role="dialog"]`).waitFor({ timeout: 5000 });

    // The popover exposes role=dialog via its shadow content.
    const dialogCount = await page.locator(`${POPOVER} [role="dialog"]`).count();
    expect(dialogCount).toBe(1);

    // Escape dismisses — focus returns to the trigger.
    await page.keyboard.press("Escape");
    await expect(page.locator(STATE)).toHaveText("activated", { timeout: 5000 });
    await expect(page.locator(TRIGGER)).toBeFocused();
  });

  test("image lightbox mounts on click and closes on Escape", async ({ page }) => {
    await page.locator(LB_TRIGGER).click();
    // The lightbox renders at a very high z-index; its role=dialog lives inside
    // the mount point's shadow root.
    await expect(page.locator(`${LB_MOUNT} [role="dialog"]`)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator(LB_MOUNT)).toContainText(
      "Widgets don't have to share"
    );
    await expect(page.locator(LB_MOUNT)).toContainText("Press");

    await page.keyboard.press("Escape");
    await expect(page.locator(`${LB_MOUNT} [role="dialog"]`)).toHaveCount(0);
  });

  test("analytics panel records lifecycle events", async ({ page }) => {
    await page.locator(TRIGGER).click();
    await expect(page.locator(STATE)).toHaveText("mounted", { timeout: 5000 });

    const count = await page.locator('[id="analytics-count"]').textContent();
    expect(Number(count)).toBeGreaterThan(0);

    const entries = page.locator(".analytics-entry");
    expect(await entries.count()).toBeGreaterThan(0);
    // Should include at least one mount_end event
    await expect(entries.first()).toContainText("payment-breakdown");
  });

  test("hover-then-click is fast: preload primes the module cache", async ({ page }) => {
    await page.locator(TRIGGER).hover();
    await expect(page.locator(STATE)).toHaveText(/preloaded|preloading/, {
      timeout: 2000,
    });
    // Wait for preload to settle
    await expect(page.locator(STATE)).toHaveText("preloaded");

    const start = Date.now();
    await page.locator(TRIGGER).click();
    await expect(page.locator(POPOVER)).toContainText("Total");
    const elapsed = Date.now() - start;

    // After preload, mount should complete under 1s including 150ms mock latency.
    expect(elapsed).toBeLessThan(1500);
  });
});
