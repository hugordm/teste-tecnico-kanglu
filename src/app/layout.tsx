import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Poppins nos títulos (--font-heading via @theme), Inter no corpo (--font-body).
// `variable` expõe cada fonte como CSS var; o @theme do globals.css encaminha
// essas vars para os utilitários font-heading / font-body do Tailwind.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"], // só os pesos de título que usamos
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase resolve URLs relativas de openGraph/canonical para absolutas.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Blog Kanglu",
    template: "%s — Blog Kanglu",
  },
  description: "Artigos e novidades da Kanglu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">{children}</body>
    </html>
  );
}
