import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ParcelAppProvider } from "@/context/parcel-app-context";
import { getSessionRoleFromCookies } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AppPageProps = {
  searchParams?: Promise<{ fresh?: string }>;
};

export default async function AppPage(props: AppPageProps) {
  const { fresh } = (await props.searchParams) ?? {};
  if (fresh !== "1") {
    redirect("/login");
  }
  const role = await getSessionRoleFromCookies(await cookies()).catch(() => null);
  if (!role) {
    redirect("/login");
  }
  return (
    <ParcelAppProvider>
      <AppShell userRole={role} />
    </ParcelAppProvider>
  );
}
