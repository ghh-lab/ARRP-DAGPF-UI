import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARRPSAT GREEN",
  description:
    "Visualisation des parcelles et donnees geospatiales (ARRPSAT GREEN)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
