import type { PreviewKind, TransferEntry } from './types';

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  /** Own size for files, aggregated size of the subtree for folders. */
  size: number;
  fileCount: number;
  entry: TransferEntry | null;
  children: TreeNode[];
}

function makeNode(name: string, path: string, isDir: boolean): TreeNode {
  return { name, path, isDir, size: 0, fileCount: 0, entry: null, children: [] };
}

/**
 * Rebuilds the directory tree from the flat entry list the API returns.
 * Folders that only exist as a path prefix are materialised on the way, so a
 * transfer never renders with a hole in the middle of its structure.
 */
export function buildTree(entries: TransferEntry[]): TreeNode {
  const root = makeNode('', '', true);
  const byPath = new Map<string, TreeNode>([['', root]]);

  const ensureDir = (path: string): TreeNode => {
    const existing = byPath.get(path);
    if (existing) return existing;

    const idx = path.lastIndexOf('/');
    const parent = ensureDir(idx === -1 ? '' : path.slice(0, idx));
    const node = makeNode(idx === -1 ? path : path.slice(idx + 1), path, true);

    parent.children.push(node);
    byPath.set(path, node);
    return node;
  };

  for (const entry of entries) {
    if (entry.isDir) {
      ensureDir(entry.path);
      continue;
    }

    const idx = entry.path.lastIndexOf('/');
    const parent = ensureDir(idx === -1 ? '' : entry.path.slice(0, idx));
    const node = makeNode(entry.name, entry.path, false);
    node.size = entry.size;
    node.fileCount = 1;
    node.entry = entry;
    parent.children.push(node);
  }

  const aggregate = (node: TreeNode): void => {
    if (!node.isDir) return;
    let size = 0;
    let count = 0;
    for (const child of node.children) {
      aggregate(child);
      size += child.size;
      count += child.fileCount;
    }
    node.size = size;
    node.fileCount = count;
  };

  aggregate(root);
  return root;
}

export function findNode(root: TreeNode, path: string): TreeNode | null {
  if (!path) return root;

  let node: TreeNode = root;
  for (const segment of path.split('/')) {
    const next = node.children.find((child) => child.name === segment && child.isDir);
    if (!next) return null;
    node = next;
  }
  return node;
}

export type SortMode = 'name' | 'size' | 'type';

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function sortNodes(nodes: TreeNode[], mode: SortMode): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (mode === 'size') return b.size - a.size;
    if (mode === 'type') {
      const byType = extensionOf(a.name).localeCompare(extensionOf(b.name));
      if (byType !== 0) return byType;
    }
    return byName(a.name, b.name);
  });
}

/**
 * Orders a flat, folder-less list of files. "Name" compares the full path so
 * files from one folder stay together and follow their folder order.
 */
export function sortEntries(entries: TransferEntry[], mode: SortMode): TransferEntry[] {
  return [...entries].sort((a, b) => {
    if (mode === 'size' && a.size !== b.size) return b.size - a.size;
    if (mode === 'type') {
      const byType = extensionOf(a.name).localeCompare(extensionOf(b.name));
      if (byType !== 0) return byType;
    }
    return byName(a.path, b.path);
  });
}

/**
 * Every file in the transfer in reading order: a folder's own files first,
 * then its subfolders, each sorted the way the listing shows them. The preview
 * modal pages through this, so "next" walks out of one folder into the next.
 */
export function flattenFiles(root: TreeNode, mode: SortMode): TransferEntry[] {
  const out: TransferEntry[] = [];
  const walk = (node: TreeNode) => {
    const children = sortNodes(node.children, mode);
    for (const child of children) if (!child.isDir && child.entry) out.push(child.entry);
    for (const child of children) if (child.isDir) walk(child);
  };
  walk(root);
  return out;
}

const MEDIA_KINDS = new Set<PreviewKind>([
  'image',
  'svg',
  'video',
  'audio',
  'image-render',
  'video-render',
]);

/** Pictures, video and audio - what the media view gathers from every folder. */
export function isMediaEntry(entry: TransferEntry): boolean {
  return !entry.isDir && entry.previewKind !== null && MEDIA_KINDS.has(entry.previewKind);
}

/** Folder part of a path, "" for the root. */
export function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Every file in the transfer whose path matches the query. */
export function searchFiles(entries: TransferEntry[], query: string): TransferEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  return entries
    .filter((entry) => !entry.isDir && entry.path.toLowerCase().includes(needle))
    .slice(0, 500);
}

export function breadcrumbsFor(path: string): { name: string; path: string }[] {
  if (!path) return [];

  const crumbs: { name: string; path: string }[] = [];
  let acc = '';
  for (const segment of path.split('/')) {
    acc = acc ? `${acc}/${segment}` : segment;
    crumbs.push({ name: segment, path: acc });
  }
  return crumbs;
}
