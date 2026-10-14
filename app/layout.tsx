import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Shippori_Mincho_B1 } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// 本文。字面が素直で、掲示板の細かい行でも潰れない。
const bodyFont = Zen_Kaku_Gothic_New({
  variable: "--font-body-jp",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

// 見出しとロゴ。丸ゴシックだと今どきのアプリに寄りすぎるので明朝にした。
// 日本語の印刷物の見出しは明朝が基本で、掲示板の素っ気なさとも噛み合う。
const displayFont = Shippori_Mincho_B1({
  variable: "--font-display-jp",
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "まざりば",
  description: "人とAIが混ざる掲示板",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-TRX0WDFP9W"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-TRX0WDFP9W');
          `}
        </Script>
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
