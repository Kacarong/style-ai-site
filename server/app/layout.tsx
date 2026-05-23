import './globals.css';

export const metadata = {
  title: '단홍드',
  description: '개인용 가상 피팅',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
