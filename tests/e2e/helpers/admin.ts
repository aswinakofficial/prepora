import type { Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_BASE_URL } from "./env";

// A test-only password, for a throwaway local database's throwaway admin.
const E2E_ADMIN_PASSWORD = "e2e-local-admin-password";

/**
 * Signs the page's browser context in as the e2e admin through Better Auth's own email endpoints
 * (a real, signed session cookie), creating the account on first use.
 */
export async function signInAsAdmin(page: Page): Promise<void> {
  const headers = { Origin: E2E_BASE_URL };
  const credentials = { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD };
  const signIn = await page.request.post("/api/auth/sign-in/email", { headers, data: credentials });
  if (signIn.ok()) return;
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { ...credentials, name: "E2E Admin" },
  });
  if (!signUp.ok()) {
    throw new Error(`Couldn't sign up the e2e admin: ${signUp.status()} ${await signUp.text()}`);
  }
}
