import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isValidAdminCookieValue } from "./adminCookie";

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}
