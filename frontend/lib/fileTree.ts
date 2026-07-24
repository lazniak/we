import type { TransferEntry } from './types';

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

export function sortNodes(nodes: TreeNode[], mode: SortMode): TreeNode[] {
  const extension = (name: string) => {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  };

  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (mode === 'size') return b.size - a.size;
    if (mode === 'type') {
      const byType = extension(a.name).localeCompare(extension(b.name));
      if (byType !== 0) return byType;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
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
