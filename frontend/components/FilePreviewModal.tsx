'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Download, Loader2, Rotate3d, X } from 'lucide-react';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { isTabularFile } from './FileIcon';
import type { TransferEntry } from '@/lib/types';

/* Heavy viewers load their code (and vendor scripts) only when first opened. */
const spinner = () => (
  <div className="w-[min(92vw,64rem)] h-[75vh] flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-accent/60 animate-spin" />
  </div>
);
const PanoViewer = dynamic(() => import('./viewers/PanoViewer'), { ssr: false, loading: spinner });
const ModelViewer = dynamic(() => import('./viewers/ModelViewer'), { ssr: false, loading: spinner });
const MedicalViewer = dynamic(() => import('./viewers/MedicalViewer'), { ssr: false, loading: spinner });
const ArchiveViewer = dynamic(() => import('./viewers/ArchiveViewer'), { ssr: false, loading: spinner });

interface FilePreviewModalProps {
  transferId: string;
  entries: TransferEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const TEXT_PREVIEW_BYTES = 256 * 1024;

function parseDelimited(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.slice(0, 500);
}

/**
 * Shows a server-rendered rendition. The type is probed with a HEAD (which
 * triggers the conversion) and then the element streams from the cached URL,
 * so a large remuxed video is never pulled fully into memory.
 */
function RenderedPreview({ transferId, entry }: { transferId: string; entry: TransferEntry }) {
  const [state, setState] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    setError(false);
    const url = api.render(transferId, entry.id);

    fetch(url, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ url, type: (res.headers.get('content-type') || '').split(';')[0] });
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(true);
      });

    return () => controller.abort();
  }, [transferId, entry.id]);

  if (error) {
    return (
      <div className="w-[min(92vw,60rem)] h-[60vh] flex items-center justify-center text-center px-6 text-sm text-white/40">
        Nie udało się wygenerować podglądu tego pliku. Pobierz go, aby otworzyć w oryginalnej aplikacji.
      </div>
    );
  }
  if (!state) {
    return (
      <div className="w-[min(92vw,60rem)] h-[60vh] flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-6 h-6 text-accent/60 animate-spin" />
        <span className="text-xs text-white/40">Generowanie podglądu…</span>
      </div>
    );
  }

  if (state.type === 'application/pdf') {
    return (
      <iframe src={state.url} title={entry.name} className="w-[min(92vw,60rem)] h-[80vh] rounded-lg bg-white" />
    );
  }
  if (state.type.startsWith('video/')) {
    return (
      <video src={state.url} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" controls autoPlay playsInline />
    );
  }
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={state.url} alt={entry.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />;
}

export default function FilePreviewModal({
  transferId,
  entries,
  index,
  onIndexChange,
  onClose,
}: FilePreviewModalProps) {
  const entry = entries[index];
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Manual 360 toggle, on by default when the file is detected as spherical. */
  const [pano, setPano] = useState(false);

  const kind = entry?.previewKind ?? null;
  const previewUrl = entry ? api.preview(transferId, entry.id) : '';

  useEffect(() => {
    setPano(entry?.is360 ?? false);
  }, [entry]);

  const goto = useCallback(
    (delta: number) => {
      if (entries.length < 2) return;
      onIndexChange((index + delta + entries.length) % entries.length);
    },
    [entries.length, index, onIndexChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goto(1);
      if (event.key === 'ArrowLeft') goto(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto, onClose]);

  useEffect(() => {
    setText(null);
    if (!entry || kind !== 'text') return;

    const controller = new AbortController();
    setLoading(true);
    fetch(previewUrl, { signal: controller.signal, headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('preview failed'))))
      .then(setText)
      .catch(() => setText(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [entry, kind, previewUrl]);

  const fontFamily = useMemo(() => (entry ? `preview-font-${entry.id}` : ''), [entry]);
  useEffect(() => {
    if (!entry || kind !== 'font') return;
    let face: FontFace | null = null;
    let cancelled = false;
    (async () => {
      try {
        face = new FontFace(fontFamily, `url(${previewUrl})`);
        await face.load();
        if (!cancelled) document.fonts.add(face);
      } catch {
        /* corrupt font - the specimen just will not change */
      }
    })();
    return () => {
      cancelled = true;
      if (face) document.fonts.delete(face);
    };
  }, [entry, kind, fontFamily, previewUrl]);

  const table = useMemo(() => {
    if (!entry || !text || !isTabularFile(entry.name)) return null;
    return parseDelimited(text, entry.name.toLowerCase().endsWith('.tsv') ? '\t' : ',');
  }, [entry, text]);

  if (!entry) return null;

  const canToggle360 =
    entry.is360 || kind === 'image' || kind === 'video' || kind === 'image-render' || kind === 'video-render';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 truncate font-medium">{entry.name}</p>
          <p className="text-xs text-white/40 truncate">
            {entry.path !== entry.name && <span className="mr-2">{entry.path}</span>}
            {formatBytes(entry.size)}
          </p>
        </div>

        {canToggle360 && (
          <button
            onClick={() => setPano((p) => !p)}
            className={`p-2 rounded-lg transition-colors ${pano ? 'text-accent bg-accent/10' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
            aria-label="Przełącz widok 360°"
            title="Widok 360°"
          >
            <Rotate3d className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => triggerDownload(api.downloadFile(transferId, entry.id))}
          className="p-2 rounded-lg text-white/60 hover:text-accent hover:bg-white/10 transition-colors"
          aria-label="Pobierz ten plik"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Zamknij podgląd"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 sm:p-6">
        {entries.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              goto(-1);
            }}
            className="absolute left-2 sm:left-4 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 transition-colors z-10"
            aria-label="Poprzedni plik"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {/* 360 takes over for any image/video when toggled on. */}
          {pano && (kind === 'image' || kind === 'svg' || kind === 'video') && (
            <PanoViewer url={previewUrl} type={kind === 'video' ? 'video' : 'image'} />
          )}
          {pano && (kind === 'image-render' || kind === 'video-render') && (
            <PanoViewer
              url={api.render(transferId, entry.id)}
              type={kind === 'video-render' ? 'video' : 'image'}
            />
          )}

          {!pano && (kind === 'image' || kind === 'svg') && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt={entry.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
          )}
          {!pano && kind === 'video' && (
            <video src={previewUrl} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" controls autoPlay playsInline />
          )}
          {kind === 'audio' && (
            <div className="glass rounded-2xl p-8 w-[min(90vw,28rem)]">
              <audio src={previewUrl} className="w-full" controls autoPlay />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe src={previewUrl} title={entry.name} className="w-[min(92vw,60rem)] h-[80vh] rounded-lg bg-white" />
          )}

          {!pano && (kind === 'image-render' || kind === 'video-render' || kind === 'document') && (
            <RenderedPreview transferId={transferId} entry={entry} />
          )}

          {kind === 'model3d' && <ModelViewer url={api.asset(transferId, entry.id, entry.name)} />}
          {kind === 'medical' && (
            <MedicalViewer url={api.asset(transferId, entry.id, entry.name)} name={entry.name} />
          )}
          {kind === 'archive' && (
            <ArchiveViewer transferId={transferId} fileId={entry.id} name={entry.name} />
          )}

          {kind === 'font' && (
            <div className="glass rounded-2xl p-8 w-[min(92vw,48rem)] max-h-[78vh] overflow-auto space-y-6">
              <div style={{ fontFamily }} className="text-white/90 space-y-4">
                <p className="text-4xl sm:text-5xl leading-tight">Zażółć gęślą jaźń</p>
                <p className="text-2xl text-white/70">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                <p className="text-2xl text-white/70">abcdefghijklmnopqrstuvwxyz</p>
                <p className="text-2xl text-white/70">0123456789 &amp;@#?!„”—</p>
                <p className="text-base text-white/50">ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż</p>
              </div>
            </div>
          )}

          {kind === 'text' && (
            <div className="glass rounded-2xl p-4 w-[min(92vw,60rem)] h-[78vh] overflow-auto custom-scrollbar">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-accent/50 mx-auto mt-8" />
              ) : table ? (
                <table className="w-full text-xs text-left border-collapse selectable">
                  <tbody>
                    {table.map((row, r) => (
                      <tr key={r} className={r === 0 ? 'text-accent/80 font-medium' : 'text-white/60'}>
                        {row.map((cell, c) => (
                          <td key={c} className="border border-white/[0.06] px-2 py-1 align-top whitespace-pre-wrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : text !== null ? (
                <pre className="text-xs text-white/70 whitespace-pre-wrap break-words selectable font-mono">
                  {text}
                  {entry.size > TEXT_PREVIEW_BYTES && (
                    <span className="block mt-4 text-accent/60">… podgląd ucięty, pobierz plik, aby zobaczyć całość</span>
                  )}
                </pre>
              ) : (
                <p className="text-xs text-white/40 text-center mt-8">Podgląd niedostępny.</p>
              )}
            </div>
          )}
        </div>

        {entries.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              goto(1);
            }}
            className="absolute right-2 sm:right-4 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 transition-colors z-10"
            aria-label="Następny plik"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {entries.length > 1 && (
        <div className="text-center pb-4 text-xs text-white/30 shrink-0">
          {index + 1} / {entries.length}
        </div>
      )}
    </div>
  );
}
