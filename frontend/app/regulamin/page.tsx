import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';
import TermsContent from '@/components/TermsContent';

export const metadata: Metadata = {
  title: 'Regulamin — hexart.io',
  robots: { index: false, follow: false, nocache: true },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen flex flex-col font-body">
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Link href="/" className="inline-block mb-8 hover:opacity-80 transition-opacity">
          <Logo size="sm" />
        </Link>

        <TermsContent />

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Wróć do serwisu
        </Link>
      </div>
    </main>
  );
}
