'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileArchive, Folder, Loader2, File as FileIco } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, plural } from '@/lib/format';

interface ArchiveEntry {
  path: string;
  size: number;
  isDir: boolean;
}

interface Listing {
  entries: ArchiveEntry[];
  truncated: boolean;
  method: string;
}

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: Map<string, Node>;
}

function buildTree(entries: ArchiveEntry[]): Node {
  const root: Node = { name: '', path: '', isDir: true, size: 0, children: new Map() };

  const ensureDir = (parts: string[]): Node => {
    let node = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: acc, isDir: true, size: 0, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    return node;
  };

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    if (entry.isDir) {
      ensureDir(parts);
    } else {
      const name = parts.pop()!;
      const parent = ensureDir(parts);
      parent.children.set(name, {
        name,
        path: entry.path,
        isDir: false,
        size: entry.size,
        children: new Map(),
      });
    }
  }
  return root;
}

function TreeRow({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const children = useMemo(
    () =>
      [...node.children.values()].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      }),
    [node],
  );

  if (!node.isDir) {
    return (
      <div
        className="flex items-center gap-2 py-1.5 pr-2 rounded-lg hover:bg-white/[0.03]"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileIco className="w-3.5 h-3.5 text-white/25 shrink-0" />
        <span className="text-xs text-white/60 truncate flex-1">{node.name}</span>
        <span className="text-[11px] text-white/25 shrink-0">{formatBytes(node.size)}</span>
      </div>
    );
  }

  const fileCount = countFiles(node);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-lg hover:bg-white/[0.04] text-left"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <ChevronRight
          className={`w-3 h-3 text-white/30 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Folder className="w-3.5 h-3.5 text-accent/60 shrink-0" />
        <span className="text-xs text-white/70 truncate flex-1 font-medium">{node.name}</span>
        <span className="text-[11px] text-white/25 shrink-0">
          {fileCount} {plural(fileCount, 'plik', 'pliki', 'plików')}
        </span>
      </button>
      {open && (
        <div>
          {children.map((child) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function countFiles(node: Node): number {
  let total = 0;
  for (const child of node.children.values()) {
    total += child.isDir ? countFiles(child) : 1;
  }
  return total;
}

export default function ArchiveViewer({
  transferId,
  fileId,
  name,
}: {
  transferId: string;
  fileId: number;
  name: string;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(api.archive(transferId, fileId), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data: Listing) => setListing(data))
      .catch(() => setError(true));
    return () => controller.abort();
  }, [transferId, fileId]);

  const tree = useMemo(() => (listing ? buildTree(listing.entries) : null), [listing]);
  const rootChildren = tree
    ? [...tree.children.values()].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      })
    : [];

  return (
    <div className="w-[min(96vw,60rem)] h-[86vh] glass rounded-2xl flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10 shrink-0">
        <FileArchive className="w-4 h-4 text-accent/60" />
        <span className="text-sm text-white/80 truncate font-medium">{name}</span>
        {listing && (
          <span className="text-[11px] text-white/30 ml-auto shrink-0">
            {listing.entries.filter((e) => !e.isDir).length}{' '}
            {plural(listing.entries.filter((e) => !e.isDir).length, 'plik', 'pliki', 'plików')}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {error ? (
          <p className="text-sm text-white/40 text-center mt-10">
            Nie udało się odczytać zawartości archiwum.
          </p>
        ) : !tree ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-accent/50 animate-spin" />
          </div>
        ) : rootChildren.length === 0 ? (
          <p className="text-sm text-white/40 text-center mt-10">Archiwum jest puste.</p>
        ) : (
          rootChildren.map((node) => <TreeRow key={node.path} node={node} depth={0} />)
        )}
        {listing?.truncated && (
          <p className="text-[11px] text-amber-300/60 text-center mt-3">
            Lista skrócona — archiwum zawiera bardzo dużo plików.
          </p>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-white/10 shrink-0">
        <p className="text-[11px] text-white/25 text-center">
          Podgląd struktury archiwum. Zawartość plików w środku nie jest otwierana —
          pobierz archiwum, aby ją wypakować.
        </p>
      </div>
    </div>
  );
}
