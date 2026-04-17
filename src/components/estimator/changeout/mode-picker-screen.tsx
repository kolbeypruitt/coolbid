'use client';
import Link from 'next/link';
import { FileText, Wrench } from 'lucide-react';

export function ModePickerScreen() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-semibold">New estimate</h1>
        <p className="text-txt-secondary">What kind of job is this?</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/estimates/new/build"
          className="group flex min-h-[200px] flex-col justify-between rounded-2xl border border-border bg-bg-card/70 p-6 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:border-accent active:translate-y-0"
        >
          <FileText className="h-8 w-8 text-txt-secondary transition-colors group-hover:text-accent" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">New Build</h2>
            <p className="text-sm text-txt-secondary">Estimate from a floor plan PDF.</p>
          </div>
        </Link>

        <Link
          href="/estimates/new/changeout"
          className="group flex min-h-[200px] flex-col justify-between rounded-2xl border border-border bg-bg-card/70 p-6 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.25)] transition-all hover:-translate-y-0.5 hover:border-accent active:translate-y-0"
        >
          <Wrench className="h-8 w-8 text-txt-secondary transition-colors group-hover:text-accent" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Changeout</h2>
            <p className="text-sm text-txt-secondary">Replace equipment on an existing system.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
