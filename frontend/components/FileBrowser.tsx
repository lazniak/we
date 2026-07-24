'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpToLine,
  ChevronRight,
  Download,
  Eye,
  FolderArchive,
  Grid2X2,
  Home,
  List,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import {
  breadcrumbsFor,
  buildTree,
  findNode,
  searchFiles,
  sortNodes,
  type SortMode,
  type TreeNode,
} from '@/lib/fileTree';
import { FileIcon, isImageFile, isVideoFile } from './FileIcon';
import FilePreviewModal from './FilePreviewModal';
import type { TransferEntry } from '@/lib/types';

interface FileBrowserProps {
  transferId: string;
  entries: TransferEntry[];
  /** Lets the page paint a subtle backdrop of whatever is hovered. */
  onHoverMedia?: (url: string | null, type: 'image' | 'video' | null) => void;
}

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'size', label: 'Size' },
  { id: 'type', label: 'Type' },
];

export default function FileBrowser({ transferId, entries, onHoverMedia }: FileBrowserProps) {
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const tree = useMemo(() => buildTree(entries), [entries]);
  const searching = query.trim().length > 0;

  // A folder that disappears (transfer replaced under us) must not strand the view.
  const current = useMemo(() => findNode(tree, path) ?? tree, [tree, path]);
  useEffect(() => {
    if (!findNode(tree, path)) setPath('');
  }, [tree, path]);

  const results = useMemo(() => (searching ? searchFiles(entries, query) : []), [
    entries,
    query,
    searching,
  ]);

  const visible = useMemo(
    () => (searching ? [] : sortNodes(current.children, sort)),
    [current, searching, sort],
  );

  /** Files the preview modal can page through, in the order shown. */
  const previewable = useMemo(() => {
    const source = searching
      ? results
      : visible.filter((node) => !node.isDir).map((node) => node.entry!);
    return source.filter((entry) => entry?.previewable);
  }, [results, searching, visible]);

  const openPreview = useCallback(
    (entry: TransferEntry) => {
      const index = previewable.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) setPreviewIndex(index);
    },
    [previewable],
  );

  const hover = useCallback(
    (entry: TransferEntry | null) => {
      if (!onHoverMedia) return;
      if (!entry || !entry.previewable) {
        onHoverMedia(null, null);
        return;
      }
      if (isImageFile(entry.name)) onHoverMedia(api.preview(transferId, entry.id), 'image');
      else if (isVideoFile(entry.name)) onHoverMedia(api.preview(transferId, entry.id), 'video');
      else onHoverMedia(null, null);
    },
    [onHoverMedia, transferId],
  );

  const crumbs = breadcrumbsFor(path);
  const isEmpty = !searching && visible.length === 0;

  // A handful of loose files needs no search box, no sorting and no
  // breadcrumbs - the chrome only appears once there is something to navigate.
  const hasFolders = entries.some((entry) => entry.isDir);
  const showChrome = hasFolders || entries.length > 5;

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <div className={clsx('items-center gap-2 mb-3', showChrome ? 'flex' : 'hidden')}>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
            className="input-glass w-full rounded-xl pl-9 pr-8 py-2 text-sm placeholder:text-white/25"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white/[0.03] shrink-0">
          {SORTS.map((option) => (
            <button
              key={option.id}
              onClick={() => setSort(option.id)}
              className={clsx(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
                sort === option.id
                  ? 'bg-white/10 text-white/90'
                  : 'text-white/30 hover:text-white/60',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setView(view === 'list' ? 'grid' : 'list')}
          className="p-2 rounded-xl bg-white/[0.03] text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors shrink-0"
          aria-label={view === 'list' ? 'Switch to grid view' : 'Switch to list view'}
        >
          {view === 'list' ? <Grid2X2 className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </button>
      </div>

      {/* Breadcrumbs */}
      {!searching && showChrome && (
        <div className="flex items-center gap-1 mb-2 text-xs overflow-x-auto no-scrollbar">
          <button
            onClick={() => setPath('')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg transition-colors shrink-0',
              path ? 'text-white/40 hover:text-white/80 hover:bg-white/5' : 'text-white/70',
            )}
          >
            <Home className="w-3 h-3" />
            All files
          </button>

          {crumbs.map((crumb, index) => (
            <div key={crumb.path} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="w-3 h-3 text-white/15" />
              <button
                onClick={() => setPath(crumb.path)}
                className={clsx(
                  'px-2 py-1 rounded-lg transition-colors max-w-[10rem] truncate',
                  index === crumbs.length - 1
                    ? 'text-white/80'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5',
                )}
              >
                {crumb.name}
              </button>
            </div>
          ))}

          {path && (
            <button
              onClick={() => setPath(crumbs.length > 1 ? crumbs[crumbs.length - 2].path : '')}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
              aria-label="Go to parent folder"
            >
              <ArrowUpToLine className="w-3 h-3" />
              Up
            </button>
          )}
        </div>
      )}

      {/* Listing */}
      <div
        className="min-h-0 max-h-[22rem] overflow-y-auto overflow-x-hidden pr-1 -mr-1 custom-scrollbar"
        onMouseLeave={() => hover(null)}
      >
        {searching ? (
          results.length === 0 ? (
            <EmptyState message={`Nothing matches “${query.trim()}”`} />
          ) : (
            <div className="space-y-1">
              {results.map((entry) => (
                <FileRow
                  key={entry.id}
                  transferId={transferId}
                  entry={entry}
                  label={entry.path}
                  onPreview={() => openPreview(entry)}
                  onHover={hover}
                />
              ))}
            </div>
          )
        ) : isEmpty ? (
          <EmptyState message="This folder is empty" />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {visible.map((node) => (
              <GridCell
                key={node.path}
                transferId={transferId}
                node={node}
                onOpenFolder={() => setPath(node.path)}
                onPreview={openPreview}
                onHover={hover}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {visible.map((node) =>
              node.isDir ? (
                <FolderRow
                  key={node.path}
                  transferId={transferId}
                  node={node}
                  onOpen={() => setPath(node.path)}
                />
              ) : (
                <FileRow
                  key={node.path}
                  transferId={transferId}
                  entry={node.entry!}
                  label={node.name}
                  onPreview={() => openPreview(node.entry!)}
                  onHover={hover}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Folder level download */}
      {!searching && path && current.fileCount > 0 && (
        <button
          onClick={() => triggerDownload(api.downloadFolder(transferId, path))}
          className="mt-3 w-full py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] transition-colors flex items-center justify-center gap-2"
        >
          <FolderArchive className="w-3.5 h-3.5" />
          Download “{current.name}” as ZIP ({formatBytes(current.size)})
        </button>
      )}

      {previewIndex !== null && previewable.length > 0 && (
        <FilePreviewModal
          transferId={transferId}
          entries={previewable}
          index={Math.min(previewIndex, previewable.length - 1)}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-10 text-center text-xs text-white/25">{message}</p>;
}

function FolderRow({
  transferId,
  node,
  onOpen,
}: {
  transferId: string;
  node: TreeNode;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
      role="button"
      tabIndex={0}
      className="group flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all cursor-pointer"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/[0.08] flex items-center justify-center">
        <FileIcon filename="" mimeType="inode/directory" size="sm" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 group-hover:text-white truncate font-medium transition-colors">
          {node.name}
        </p>
        <p className="text-xs text-white/30">
          {node.fileCount} {node.fileCount === 1 ? 'file' : 'files'} · {formatBytes(node.size)}
        </p>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          triggerDownload(api.downloadFolder(transferId, node.path));
        }}
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/25 group-hover:text-accent-light hover:bg-accent/10 transition-all"
        aria-label={`Download folder ${node.name}`}
      >
        <FolderArchive className="w-4 h-4" />
      </button>

      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
    </div>
  );
}

function Thumb({ transferId, entry }: { transferId: string; entry: TransferEntry }) {
  const url = entry.previewable ? api.preview(transferId, entry.id) : null;

  if (url && isImageFile(entry.name)) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
    );
  }
  if (url && isVideoFile(entry.name)) {
    return <video src={url} className="w-full h-full object-cover" muted preload="metadata" />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <FileIcon filename={entry.name} size="sm" />
    </div>
  );
}

function FileRow({
  transferId,
  entry,
  label,
  onPreview,
  onHover,
}: {
  transferId: string;
  entry: TransferEntry;
  label: string;
  onPreview: () => void;
  onHover: (entry: TransferEntry | null) => void;
}) {
  const activate = () => (entry.previewable ? onPreview() : triggerDownload(api.downloadFile(transferId, entry.id)));

  return (
    <div
      onClick={activate}
      onKeyDown={(event) => event.key === 'Enter' && activate()}
      onMouseEnter={() => onHover(entry)}
      role="button"
      tabIndex={0}
      className="group flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all cursor-pointer"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-white/[0.03] group-hover:ring-1 group-hover:ring-white/10 transition-all">
        <Thumb transferId={transferId} entry={entry} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 group-hover:text-white truncate font-medium transition-colors">
          {label}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/30">
          {formatBytes(entry.size)}
          {entry.isDangerous && (
            <span
              className="inline-flex items-center gap-1 text-amber-400/70"
              title="Executable file — it will be delivered inside a ZIP"
            >
              <ShieldAlert className="w-3 h-3" />
              zipped
            </span>
          )}
        </p>
      </div>

      {entry.previewable && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/25 group-hover:text-white/70 hover:bg-white/10 transition-all"
          aria-label={`Preview ${entry.name}`}
        >
          <Eye className="w-4 h-4" />
        </button>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          triggerDownload(api.downloadFile(transferId, entry.id));
        }}
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/25 group-hover:text-accent-light hover:bg-accent/10 transition-all"
        aria-label={`Download ${entry.name}`}
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

function GridCell({
  transferId,
  node,
  onOpenFolder,
  onPreview,
  onHover,
}: {
  transferId: string;
  node: TreeNode;
  onOpenFolder: () => void;
  onPreview: (entry: TransferEntry) => void;
  onHover: (entry: TransferEntry | null) => void;
}) {
  const entry = node.entry;

  const activate = () => {
    if (node.isDir) onOpenFolder();
    else if (entry?.previewable) onPreview(entry);
    else if (entry) triggerDownload(api.downloadFile(transferId, entry.id));
  };

  return (
    <div
      onClick={activate}
      onKeyDown={(event) => event.key === 'Enter' && activate()}
      onMouseEnter={() => onHover(entry)}
      role="button"
      tabIndex={0}
      title={node.name}
      className="group relative flex flex-col rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all cursor-pointer overflow-hidden"
    >
      <div className="aspect-square w-full bg-white/[0.02] flex items-center justify-center overflow-hidden">
        {node.isDir ? (
          <FileIcon filename="" mimeType="inode/directory" size="lg" />
        ) : (
          <Thumb transferId={transferId} entry={entry!} />
        )}
      </div>

      <div className="p-2">
        <p className="text-[11px] text-white/70 group-hover:text-white truncate transition-colors">
          {node.name}
        </p>
        <p className="text-[10px] text-white/25">
          {node.isDir
            ? `${node.fileCount} ${node.fileCount === 1 ? 'file' : 'files'}`
            : formatBytes(node.size)}
        </p>
      </div>

      {!node.isDir && entry && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            triggerDownload(api.downloadFile(transferId, entry.id));
          }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex items-center justify-center text-white/70 hover:text-accent-light transition-all"
          aria-label={`Download ${node.name}`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
