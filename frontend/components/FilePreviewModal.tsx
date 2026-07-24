'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { api, triggerDownload } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { isTabularFile, previewKindOf } from './FileIcon';
import type { TransferEntry } from '@/lib/types';

interface FilePreviewModalProps {
  transferId: string;
  entries: TransferEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Tekstowy podgląd jest ucinany, żeby wielki log nie zawiesił karty. */
const TEXT_PREVIEW_BYTES = 256 * 1024;

/** Minimalny parser CSV/TSV: cudzysłowy, podwojone cudzysłowy, nowe linie. */
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
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
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
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.slice(0, 500);
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

  const kind = entry ? previewKindOf(entry.name) : null;
  const url = entry ? api.preview(transferId, entry.id) : '';

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

    fetch(url, {
      signal: controller.signal,
      headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
    })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('preview failed'))))
      .then(setText)
      .catch(() => setText(null))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [entry, kind, url]);

  // Krój ładowany przez FontFace, żeby pokazać wzornik zamiast ikony pliku.
  const fontFamily = useMemo(
    () => (entry ? `preview-font-${entry.id}` : ''),
    [entry],
  );

  useEffect(() => {
    if (!entry || kind !== 'font') return;

    let face: FontFace | null = null;
    let cancelled = false;

    (async () => {
      try {
        face = new FontFace(fontFamily, `url(${url})`);
        await face.load();
        if (!cancelled) document.fonts.add(face);
      } catch {
        /* uszkodzony lub nieobsługiwany krój - zostaje komunikat zastępczy */
      }
    })();

    return () => {
      cancelled = true;
      if (face) document.fonts.delete(face);
    };
  }, [entry, kind, fontFamily, url]);

  const table = useMemo(() => {
    if (!entry || !text || !isTabularFile(entry.name)) return null;
    return parseDelimited(text, entry.name.toLowerCase().endsWith('.tsv') ? '\t' : ',');
  }, [entry, text]);

  if (!entry) return null;

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

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 sm:p-8">
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

        <div
          className="max-w-full max-h-full flex items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          {/* SVG idzie przez <img>: tak załadowany obraz nie wykonuje skryptów. */}
          {(kind === 'image' || kind === 'svg') && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={entry.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
          )}

          {kind === 'video' && (
            <video
              src={url}
              className="max-w-full max-h-[75vh] rounded-lg shadow-2xl"
              controls
              autoPlay
              playsInline
            />
          )}

          {kind === 'audio' && (
            <div className="glass rounded-2xl p-8 w-[min(90vw,28rem)]">
              <audio src={url} className="w-full" controls autoPlay />
            </div>
          )}

          {kind === 'pdf' && (
            <iframe
              src={url}
              title={entry.name}
              className="w-[min(92vw,60rem)] h-[78vh] rounded-lg bg-white"
            />
          )}

          {kind === 'font' && (
            <div className="glass rounded-2xl p-8 w-[min(92vw,48rem)] max-h-[78vh] overflow-auto space-y-6">
              <div style={{ fontFamily }} className="text-white/90 space-y-4">
                <p className="text-4xl sm:text-5xl leading-tight">Zażółć gęślą jaźń</p>
                <p className="text-2xl text-white/70">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                <p className="text-2xl text-white/70">abcdefghijklmnopqrstuvwxyz</p>
                <p className="text-2xl text-white/70">0123456789 &amp;@#?!„”—</p>
                <p className="text-base text-white/50">
                  ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż — pełny zestaw polskich znaków
                </p>
              </div>
              <p className="text-[11px] text-white/25 border-t border-white/10 pt-3">
                Podgląd kroju renderowany lokalnie w przeglądarce.
              </p>
            </div>
          )}

          {kind === 'text' && (
            <div className="glass rounded-2xl p-4 w-[min(92vw,60rem)] h-[78vh] overflow-auto custom-scrollbar">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-accent/50 mx-auto mt-8" />
              ) : table ? (
                <table className="w-full text-xs text-left border-collapse selectable">
                  <tbody>
                    {table.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={rowIndex === 0 ? 'text-accent/80 font-medium' : 'text-white/60'}
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="border border-white/[0.06] px-2 py-1 align-top whitespace-pre-wrap"
                          >
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
                    <span className="block mt-4 text-accent/60">
                      … podgląd ucięty, pobierz plik, aby zobaczyć całość
                    </span>
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
