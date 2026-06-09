import { requireAdminRoleStrict } from "@/lib/api-security";

export async function requireAdminRole() {
  return requireAdminRoleStrict();
}
