'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, HardDrive, Zap } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import type { Stats as StatsType } from '@/lib/types';

export default function Stats() {
  const [stats, setStats] = useState<StatsType | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) setStats(await res.json());
      } catch {
        /* stats are decoration, never block the page on them */
      }
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-12 px-4">
      <div className="flex items-center justify-center gap-4 sm:gap-7 flex-wrap text-white/30">
        {/*
          Two deliberately different numbers: everything ever sent, and the
          much smaller amount actually held right now. Labelling only the
          first one "transfers" made the page look like it was hoarding files.
        */}
        <Metric
          icon={<ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
          label="Sent all time"
          value={`${stats.totalTransfers} · ${stats.totalGB} GB`}
        />

        <span className="w-px h-4 bg-white/10 hidden sm:block" />

        <Metric
          icon={<HardDrive className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
          label="Stored now"
          value={
            stats.storedTransfers > 0
              ? `${stats.storedTransfers} · ${formatBytes(stats.storedBytes)}`
              : 'nothing'
          }
        />

        {stats.activeTransfers > 0 && (
          <>
            <span className="w-px h-4 bg-white/10 hidden sm:block" />
            <Metric
              icon={<Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent-light" />}
              label="Uploading"
              value={String(stats.activeTransfers)}
              accent
            />
          </>
        )}
      </div>

      <p className="mt-3 text-center text-[10px] text-white/15">
        Everything deletes itself when its link expires.
      </p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {icon}
      <span className="text-[10px] sm:text-xs uppercase tracking-wider">{label}</span>
      <span
        className={`font-medium text-xs sm:text-sm ${accent ? 'text-accent-light' : 'text-white/60'}`}
      >
        {value}
      </span>
    </div>
  );
}
