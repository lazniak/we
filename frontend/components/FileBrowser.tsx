'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpToLine,
  ChevronRight,
  Download,
  Eye,
  FolderArchive,
  Grid2X2,
  Home,
  Images,
  List,
  Play,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes, plural } from '@/lib/format';
import {
  breadcrumbsFor,
  buildTree,
  findNode,
  flattenFiles,
  hasThumbnail,
  isMediaEntry,
  parentPath,
  searchFiles,
  sortEntries,
  sortNodes,
  type SortMode,
  type TreeNode,
} from '@/lib/fileTree';
import { FileIcon } from './FileIcon';
import FilePreviewModal from './FilePreviewModal';
import type { TransferEntry } from '@/lib/types';

interface FileBrowserProps {
  transferId: string;
  entries: TransferEntry[];
  /** Lets the page paint a subtle backdrop of whatever is hovered. */
  onHoverMedia?: (url: string | null, type: 'image' | 'video' | null) => void;
}

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Nazwa' },
  { id: 'size', label: 'Rozmiar' },
  { id: 'type', label: 'Typ' },
];

type ViewMode = 'list' | 'grid' | 'media';

/** How long the pointer rests on a row before its backdrop is fetched. */
const HOVER_INTENT_MS = 120;

/**
 * A failed thumbnail is asked for once more after this long. A busy server
 * answers 503, and an <img> cannot tell that from "nothing to show" - which
 * the server remembers, so the second ask is cheap either way.
 */
const THUMB_RETRY_MS = 3000;

const VIEWS: { id: ViewMode; label: string; Icon: typeof List }[] = [
  { id: 'list', label: 'Lista', Icon: List },
  { id: 'grid', label: 'Siatka', Icon: Grid2X2 },
  { id: 'media', label: 'Multimedia', Icon: Images },
];

export default function FileBrowser({ transferId, entries, onHoverMedia }: FileBrowserProps) {
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const tree = useMemo(() => buildTree(entries), [entries]);
  const media = useMemo(() => entries.filter(isMediaEntry), [entries]);

  // A transfer that is mostly pictures, video and audio opens as a gallery.
  // Decided once, when the browser mounts; from then on the choice is the user's.
  const [view, setView] = useState<ViewMode>(() =>
    media.length >= 2 && media.length * 2 > tree.fileCount ? 'media' : 'list',
  );

  const searching = query.trim().length > 0;
  const inMedia = view === 'media' && !searching;

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

  /** The media view: every picture, video and audio file, folders flattened away. */
  const gallery = useMemo(() => sortEntries(media, sort), [media, sort]);

  /**
   * Files the preview modal can page through. Search and the media view page
   * through exactly what is on screen; the folder views page through the whole
   * transfer in reading order, so the arrows carry on into the next folder.
   */
  const previewable = useMemo(() => {
    const source = searching ? results : view === 'media' ? gallery : flattenFiles(tree, sort);
    return source.filter((entry) => entry.previewable);
  }, [gallery, results, searching, sort, tree, view]);

  const openPreview = useCallback(
    (entry: TransferEntry) => {
      const index = previewable.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) setPreviewIndex(index);
    },
    [previewable],
  );

  /**
   * Paging in the modal drags the folder view along, so closing it lands in
   * the folder of whatever was on screen last.
   */
  const changePreview = useCallback(
    (index: number) => {
      setPreviewIndex(index);
      if (searching || view === 'media') return;
      const target = previewable[index];
      if (target) setPath(parentPath(target.path));
    },
    [previewable, searching, view],
  );

  /**
   * Paints the page backdrop for whatever is hovered. Pictures show as their
   * large thumbnail - a backdrop at a fifth of full opacity has no use for the
   * original bytes - while playable video still moves. The short delay lets a
   * pointer sweep across the list without fetching a backdrop per row passed.
   */
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const hover = useCallback(
    (entry: TransferEntry | null) => {
      if (!onHoverMedia) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (!entry) {
        onHoverMedia(null, null);
        return;
      }
      hoverTimer.current = setTimeout(() => {
        const kind = entry.previewKind;
        if (kind === 'video' && !entry.is360) {
          onHoverMedia(api.preview(transferId, entry.id), 'video');
        } else if (kind === 'image' || kind === 'svg' || kind === 'image-render' || kind === 'video-render') {
          onHoverMedia(api.thumb(transferId, entry.id, 'lg'), 'image');
        } else onHoverMedia(null, null);
      }, HOVER_INTENT_MS);
    },
    [onHoverMedia, transferId],
  );

  const crumbs = breadcrumbsFor(path);
  const isEmpty = !searching && visible.length === 0;

  // A handful of loose files needs no search box, no sorting and no
  // breadcrumbs - the chrome only appears once there is something to navigate.
  // The view switcher also shows up as soon as there is a gallery to offer.
  const hasFolders = entries.some((entry) => entry.isDir);
  const showChrome = hasFolders || entries.length > 5;
  const showViews = showChrome || media.length >= 2;
  const views = media.length > 0 ? VIEWS : VIEWS.filter((option) => option.id !== 'media');

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <div className={clsx('flex-wrap items-center gap-2 mb-3', showViews ? 'flex' : 'hidden')}>
        {showChrome && (
          <>
            {/* On a phone the search box takes its own row; sorting and the
                view switcher share the next one. */}
            <div className="relative basis-full sm:basis-0 sm:flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj plików…"
                aria-label="Szukaj plików"
                className="input-glass w-full rounded-xl pl-9 pr-8 py-2 text-sm placeholder:text-white/25"
              />
              {searching && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                  aria-label="Wyczyść wyszukiwanie"
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
          </>
        )}

        <div
          className="ml-auto flex items-center gap-0.5 p-0.5 rounded-xl bg-white/[0.03] shrink-0"
          role="group"
          aria-label="Widok"
        >
          {views.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-label={label}
              aria-pressed={view === id}
              title={label}
              className={clsx(
                'p-1.5 rounded-lg transition-colors',
                view === id ? 'bg-white/10 text-white/90' : 'text-white/30 hover:text-white/60',
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Media view header - the icon-only switcher needs a name for what is shown. */}
      {inMedia && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 text-xs text-white/50">
          <Images className="w-3 h-3" />
          Multimedia z całego transferu
          <span className="text-white/25">
            · {gallery.length} {plural(gallery.length, 'plik', 'pliki', 'plików')}
          </span>
        </div>
      )}

      {/* Breadcrumbs */}
      {!searching && !inMedia && showChrome && (
        <div className="flex items-center gap-1 mb-2 text-xs overflow-x-auto no-scrollbar">
          <button
            onClick={() => setPath('')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg transition-colors shrink-0',
              path ? 'text-white/40 hover:text-white/80 hover:bg-white/5' : 'text-white/70',
            )}
          >
            <Home className="w-3 h-3" />
            Wszystkie pliki
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
              aria-label="Katalog wyżej"
            >
              <ArrowUpToLine className="w-3 h-3" />
              Wyżej
            </button>
          )}
        </div>
      )}

      {/* Listing */}
      <div
        className="min-h-0 max-h-[min(34rem,62vh)] overflow-y-auto overflow-x-hidden pr-1 -mr-1 custom-scrollbar"
        onMouseLeave={() => hover(null)}
      >
        {searching ? (
          results.length === 0 ? (
            <EmptyState message={`Brak wyników dla „${query.trim()}”`} />
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
        ) : inMedia ? (
          gallery.length === 0 ? (
            <EmptyState message="Brak zdjęć, wideo ani audio w tym transferze" />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {gallery.map((entry) => (
                <MediaCell
                  key={entry.id}
                  transferId={transferId}
                  entry={entry}
                  showFolder={hasFolders}
                  onPreview={openPreview}
                  onHover={hover}
                />
              ))}
            </div>
          )
        ) : isEmpty ? (
          <EmptyState message="Ten katalog jest pusty" />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2.5">
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
      {!searching && !inMedia && path && current.fileCount > 0 && (
        <button
          onClick={() => triggerDownload(api.downloadFolder(transferId, path))}
          className="mt-3 w-full py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] transition-colors flex items-center justify-center gap-2"
        >
          <FolderArchive className="w-3.5 h-3.5" />
          Pobierz „{current.name}” jako ZIP ({formatBytes(current.size)})
        </button>
      )}

      {previewIndex !== null && previewable.length > 0 && (
        <FilePreviewModal
          transferId={transferId}
          entries={previewable}
          index={Math.min(previewIndex, previewable.length - 1)}
          onIndexChange={changePreview}
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
          {node.fileCount} {plural(node.fileCount, 'plik', 'pliki', 'plików')} · {formatBytes(node.size)}
        </p>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          triggerDownload(api.downloadFolder(transferId, node.path));
        }}
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/25 group-hover:text-accent-light hover:bg-accent/10 transition-all"
        aria-label={`Pobierz katalog ${node.name}`}
      >
        <FolderArchive className="w-4 h-4" />
      </button>

      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
    </div>
  );
}

function Thumb({
  transferId,
  entry,
  iconSize = 'sm',
}: {
  transferId: string;
  entry: TransferEntry;
  iconSize?: 'sm' | 'lg';
}) {
  // Media gets a small WebP made and cached by the server: a few kilobytes
  // instead of the whole photo, a still frame instead of a video element per
  // tile, and exotic formats (RAW, PSD, MKV…) included. The type icon stands
  // in until it arrives, and stays when there is nothing to show - audio
  // without cover art, a file no decoder can read.
  const [state, setState] = useState<'loading' | 'waiting' | 'shown' | 'none'>(() =>
    hasThumbnail(entry) ? 'loading' : 'none',
  );
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    if (state !== 'waiting') return;
    const timer = setTimeout(() => {
      setRetried(true);
      setState('loading');
    }, THUMB_RETRY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const src = api.thumb(transferId, entry.id);

  return (
    <div className="relative w-full h-full">
      {state !== 'shown' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FileIcon filename={entry.name} size={iconSize} />
        </div>
      )}
      {(state === 'loading' || state === 'shown') && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={retried ? `${src}${src.includes('?') ? '&' : '?'}retry=1` : src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState('shown')}
          onError={() => setState(retried ? 'none' : 'waiting')}
          className={clsx(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            state === 'shown' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
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
              title="Plik wykonywalny — zostanie dostarczony w archiwum ZIP"
            >
              <ShieldAlert className="w-3 h-3" />
              w ZIP-ie
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
          aria-label={`Podgląd ${entry.name}`}
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
        aria-label={`Pobierz ${entry.name}`}
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
            ? `${node.fileCount} ${plural(node.fileCount, 'plik', 'pliki', 'plików')}`
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
          aria-label={`Pobierz ${node.name}`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * One tile of the media view: the picture fills the square, the name and
 * folder sit on a gradient at the bottom so files pulled from different
 * folders still tell where they came from.
 */
function MediaCell({
  transferId,
  entry,
  showFolder,
  onPreview,
  onHover,
}: {
  transferId: string;
  entry: TransferEntry;
  showFolder: boolean;
  onPreview: (entry: TransferEntry) => void;
  onHover: (entry: TransferEntry | null) => void;
}) {
  const folder = showFolder ? parentPath(entry.path) : '';
  const isVideo = entry.previewKind === 'video' || entry.previewKind === 'video-render';

  const activate = () =>
    entry.previewable ? onPreview(entry) : triggerDownload(api.downloadFile(transferId, entry.id));

  return (
    <div
      onClick={activate}
      onKeyDown={(event) => event.key === 'Enter' && activate()}
      onMouseEnter={() => onHover(entry)}
      role="button"
      tabIndex={0}
      title={entry.path}
      className="group relative aspect-square rounded-xl bg-white/[0.03] border border-white/[0.04] hover:border-white/[0.16] transition-all cursor-pointer overflow-hidden"
    >
      <Thumb transferId={transferId} entry={entry} iconSize="lg" />

      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white/85 group-hover:bg-accent/85 group-hover:text-black transition-colors">
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
        <p className="text-[11px] text-white/85 truncate">{entry.name}</p>
        <p className="text-[10px] text-white/40 truncate">
          {folder && <span className="mr-1">{folder} ·</span>}
          {formatBytes(entry.size)}
        </p>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          triggerDownload(api.downloadFile(transferId, entry.id));
        }}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center text-white/70 hover:text-accent-light transition-all"
        aria-label={`Pobierz ${entry.name}`}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
