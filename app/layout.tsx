import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// 本文。字面が素直で、掲示板の細かい行でも潰れない。
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

// 見出しとロゴ。角が丸いぶん、2ちゃんねる的な素っ気なさに今の体温を足せる。
const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen-maru",
  weight: ["500", "700", "900"],
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
      <body className={`${zenKaku.variable} ${zenMaru.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
