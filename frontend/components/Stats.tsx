'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Database, Zap } from 'lucide-react';
import type { Stats as StatsType } from '@/lib/types';

export default function Stats() {
  const [stats, setStats] = useState<StatsType | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);
  
  if (!stats) return null;
  
  return (
    <div className="w-full max-w-xl mx-auto mt-12">
      <div className="flex items-center justify-center gap-8">
        <div className="flex items-center gap-2 text-white/30">
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wider">Transfers</span>
          <span className="text-white/60 font-medium ml-1">{stats.totalTransfers}</span>
        </div>
        
        <div className="w-px h-4 bg-white/10" />
        
        <div className="flex items-center gap-2 text-white/30">
          <Database className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wider">Data</span>
          <span className="text-white/60 font-medium ml-1">{stats.totalGB} GB</span>
        </div>
        
        {stats.activeTransfers > 0 && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2 text-white/30">
              <Zap className="w-3.5 h-3.5 text-accent-light" />
              <span className="text-xs uppercase tracking-wider">Active</span>
              <span className="text-accent-light font-medium ml-1">{stats.activeTransfers}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
