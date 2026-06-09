import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
import { getSessionRoleFromCookies } from "@/lib/auth-session";

export default async function AdminPage() {
  const role = await getSessionRoleFromCookies(await cookies()).catch(() => null);
  if (role !== "admin") {
    redirect("/login");
  }
  return <AdminPanel />;
}
