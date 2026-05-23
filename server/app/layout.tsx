import './globals.css';

export const metadata = {
  title: 'style-ai-site',
  description: '개인용 가상 피팅',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
