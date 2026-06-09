import { LoginForm } from "../../components/login-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LoginPageProps = {
  searchParams?: Promise<{ expired?: string }>;
};

export default async function LoginPage(props: LoginPageProps) {
  const { expired } = (await props.searchParams) ?? {};
  return <LoginForm expired={expired === "1"} />;
}
