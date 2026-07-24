'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, File, Folder, Plus, Upload, X } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes, plural } from '@/lib/format';

export interface FilesMetadata {
  files: File[];
  /** Relative path of each file, folder structure included. */
  paths: string[];
  /** Every folder seen while collecting, so empty ones survive the transfer. */
  dirs: string[];
  expirationDays: number;
}

interface DropZoneProps {
  onFilesSelected: (metadata: FilesMetadata) => void;
  disabled?: boolean;
}

interface FileWithPath {
  file: File;
  path: string;
  fromFolder: boolean;
}

const MAX_SIZE = 5 * 1024 * 1024 * 1024;
const MAX_FILES = 5000;

/** Recursively walks a dropped directory, recording files and folders. */
async function readDirectory(
  entry: FileSystemDirectoryEntry,
  basePath: string,
  files: FileWithPath[],
  dirs: Set<string>,
): Promise<void> {
  dirs.add(basePath);

  const reader = entry.createReader();
  const children: FileSystemEntry[] = [];

  // readEntries yields at most 100 items per call, so it has to be drained.
  await new Promise<void>((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve();
          return;
        }
        children.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });

  for (const child of children) {
    const childPath = `${basePath}/${child.name}`;

    if (child.isFile) {
      await new Promise<void>((resolve, reject) => {
        (child as FileSystemFileEntry).file((file) => {
          files.push({ file, path: childPath, fromFolder: true });
          resolve();
        }, reject);
      });
    } else if (child.isDirectory) {
      await readDirectory(child as FileSystemDirectoryEntry, childPath, files, dirs);
    }
  }
}

export default function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selected, setSelected] = useState<FileWithPath[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirationDays, setExpirationDays] = useState(3);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // localStorage is only available after hydration, so the preference is read
  // in an effect instead of during the first render.
  useEffect(() => {
    const saved = window.localStorage.getItem('we-expiration-days');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= 3 && parsed <= 7) setExpirationDays(parsed);
  }, []);

  const handleExpirationChange = (days: number) => {
    setExpirationDays(days);
    try {
      window.localStorage.setItem('we-expiration-days', String(days));
    } catch {
      /* private mode - the choice just will not be remembered */
    }
  };

  const addFiles = useCallback((incoming: FileWithPath[], incomingDirs: string[]) => {
    if (incoming.length === 0 && incomingDirs.length === 0) return;

    setSelected((previous) => {
      const seen = new Set(previous.map((item) => item.path));
      const fresh = incoming.filter((item) => !seen.has(item.path));
      const combined = [...previous, ...fresh];

      if (combined.length > MAX_FILES) {
        setError(`Za dużo plików (limit: ${MAX_FILES.toLocaleString('pl-PL')})`);
        return previous;
      }

      const total = combined.reduce((acc, item) => acc + item.file.size, 0);
      if (total > MAX_SIZE) {
        setError(`Łączny rozmiar (${formatBytes(total)}) przekracza limit 5 GB`);
        return previous;
      }

      setError(null);
      return combined;
    });

    setFolders((previous) => [...new Set([...previous, ...incomingDirs])]);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (disabled || isProcessing) return;

      setIsProcessing(true);
      setError(null);

      const files: FileWithPath[] = [];
      const dirs = new Set<string>();

      try {
        // The DataTransfer list is only valid for the duration of the event
        // handler, so every entry and file handle is captured synchronously
        // before the first await.
        const dropped = Array.from(event.dataTransfer.items || [])
          .filter((item) => item.kind === 'file')
          .map((item) => ({
            entry: item.webkitGetAsEntry?.() ?? null,
            file: item.getAsFile(),
          }));
        const plainFiles = Array.from(event.dataTransfer.files || []);

        if (dropped.some((item) => item.entry)) {
          await Promise.all(
            dropped.map(async ({ entry, file }) => {
              if (!entry) {
                if (file) files.push({ file, path: file.name, fromFolder: false });
                return;
              }

              if (entry.isFile) {
                await new Promise<void>((resolve, reject) => {
                  (entry as FileSystemFileEntry).file((picked) => {
                    files.push({ file: picked, path: picked.name, fromFolder: false });
                    resolve();
                  }, reject);
                });
              } else if (entry.isDirectory) {
                await readDirectory(entry as FileSystemDirectoryEntry, entry.name, files, dirs);
              }
            }),
          );
        } else {
          for (const file of plainFiles) {
            files.push({ file, path: file.name, fromFolder: false });
          }
        }

        if (files.length === 0 && dirs.size === 0) {
          setError('Nie znaleziono niczego do wysłania.');
          return;
        }

        addFiles(files, [...dirs]);
      } catch (err) {
        console.error('Drop failed:', err);
        setError('Nie udało się odczytać plików. Spróbuj ponownie.');
      } finally {
        setIsProcessing(false);
      }
    },
    [addFiles, disabled, isProcessing],
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      addFiles(
        picked.map((file) => ({ file, path: file.name, fromFolder: false })),
        [],
      );
      event.target.value = '';
    },
    [addFiles],
  );

  const handleDirectoryInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      const dirs = new Set<string>();

      const mapped = picked.map((file) => {
        const relative =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

        const segments = relative.split('/');
        segments.pop();
        let acc = '';
        for (const segment of segments) {
          acc = acc ? `${acc}/${segment}` : segment;
          dirs.add(acc);
        }

        return { file, path: relative, fromFolder: true };
      });

      addFiles(mapped, [...dirs]);
      event.target.value = '';
    },
    [addFiles],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled || isProcessing) return;

      const pasted: FileWithPath[] = [];
      for (const item of Array.from(event.clipboardData?.items ?? [])) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (!file) continue;

        const name =
          !file.name || file.name === 'image.png'
            ? `pasted-${Date.now()}.${file.type.split('/')[1] || 'png'}`
            : file.name;
        pasted.push({ file, path: name, fromFolder: false });
      }

      if (pasted.length > 0) {
        event.preventDefault();
        addFiles(pasted, []);
      }
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles, disabled, isProcessing]);

  const removeAt = (index: number) => {
    setSelected((previous) => previous.filter((_, i) => i !== index));
    setError(null);
  };

  const clearAll = () => {
    setSelected([]);
    setFolders([]);
    setError(null);
  };

  const totalSize = useMemo(
    () => selected.reduce((acc, item) => acc + item.file.size, 0),
    [selected],
  );

  const rootFolders = useMemo(
    () => new Set(folders.map((dir) => dir.split('/')[0])),
    [folders],
  );

  const start = () => {
    if (selected.length === 0 || disabled || isProcessing) return;
    onFilesSelected({
      files: selected.map((item) => item.file),
      paths: selected.map((item) => item.path),
      dirs: folders,
      expirationDays,
    });
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 px-4">
      {/* Expiry */}
      <div className="glass rounded-2xl p-3 sm:p-4 animate-fade-in">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-white/40 uppercase tracking-wider">Link wygasa za</span>
          <div className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-xl">
            {[3, 4, 5, 6, 7].map((day) => (
              <button
                key={day}
                onClick={() => !disabled && handleExpirationChange(day)}
                disabled={disabled}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  expirationDays === day
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.03]',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {day} dni
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop target */}
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled && !isProcessing) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={handleDrop}
        onClick={() => !disabled && !isProcessing && fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Upuść pliki lub katalogi albo wybierz z dysku"
        className={clsx(
          'drop-zone glass-strong rounded-3xl p-8 sm:p-14 cursor-pointer transition-all duration-300',
          isDragging && 'active',
          disabled && 'opacity-50 cursor-not-allowed',
          isProcessing && 'opacity-75 cursor-wait',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled || isProcessing}
        />
        <input
          ref={directoryInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          multiple
          onChange={handleDirectoryInput}
          className="hidden"
          disabled={disabled || isProcessing}
        />

        <div className="flex flex-col items-center gap-5 text-center">
          <div
            className={clsx(
              'w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center transition-all duration-300 relative',
              isDragging ? 'bg-accent/20 scale-110 glow' : 'bg-white/5',
            )}
          >
            <Upload
              className={clsx(
                'w-7 h-7 sm:w-8 sm:h-8 transition-colors relative z-10',
                isDragging ? 'text-accent-light' : 'text-white/40',
              )}
            />
          </div>

          <div>
            <p className="text-base sm:text-lg font-medium text-white/90 mb-2">
              {isProcessing ? 'Wczytywanie plików…' : 'Upuść pliki lub katalogi'}
            </p>
            <p className="text-sm text-white/40">
              albo <span className="text-accent font-medium">wybierz</span> z dysku
            </p>
            <p className="text-xs text-white/20 mt-3">
              Do 5 GB · struktura katalogów zachowana · Ctrl+V wkleja
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-strong rounded-2xl p-4 border border-red-500/20 bg-red-500/5 animate-fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="animate-fade-in">
          <div className="glass-strong rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <span className="text-xs text-white/40 uppercase tracking-wider font-medium">
                {selected.length} {plural(selected.length, 'plik', 'pliki', 'plików')}
                {rootFolders.size > 0 &&
                  ` · ${rootFolders.size} ${plural(rootFolders.size, 'katalog', 'katalogi', 'katalogów')}`}
              </span>

              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Pliki
                </button>
                <button
                  onClick={() => directoryInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Katalog
                </button>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-500/10"
                >
                  <X className="w-3.5 h-3.5" />
                  Wyczyść
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {selected.map((item, index) => (
                <div
                  key={`${item.path}-${index}`}
                  className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-xl group hover:bg-white/[0.06] transition-all"
                >
                  {item.fromFolder ? (
                    <Folder className="w-4 h-4 text-accent/60 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-white/30 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate font-medium">{item.path}</p>
                    <p className="text-xs text-white/30">{formatBytes(item.file.size)}</p>
                  </div>
                  <button
                    onClick={() => removeAt(index)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 hover:bg-white/10 rounded-lg transition-all"
                    aria-label={`Usuń ${item.path}`}
                  >
                    <X className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-xs text-white/30">Razem </span>
                <span className="text-sm font-semibold text-white/80">
                  {formatBytes(totalSize)}
                </span>
              </div>

              <button
                onClick={start}
                disabled={disabled || isProcessing}
                className="btn-primary px-8 py-3 rounded-xl font-medium text-sm shadow-lg shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Wyślij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
