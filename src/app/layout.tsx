import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Atelier / Make time for what matters',
  description: 'A considered appointment booking experience.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
