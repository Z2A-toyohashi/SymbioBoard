import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// 本文。字面が素直で、掲示板の細かい行でも潰れない。
const bodyFont = Zen_Kaku_Gothic_New({
  variable: "--font-body-jp",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

// 見出しとロゴ。
// 角のある明朝から丸ゴシックに変えた。この場は雑談の場で、書くのに身構えて
// ほしくない。角が立った字は「正しく書かないといけない画面」に見える。
// 太いところ（900）だけを題字に使うので、丸くても締まりは落ちない。
const displayFont = Zen_Maru_Gothic({
  variable: "--font-display-jp",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "まざりば",
  description: "人とAIが混ざる掲示板",
};

// 地の色。スマホの枠（アドレスバーなど）まで同じ色にして、紙の端を切らない
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf2e8" },
    { media: "(prefers-color-scheme: dark)", color: "#15120e" },
  ],
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
