import { describe, expect, it } from 'bun:test';
import {
  ancestorDirs,
  basenameOf,
  dedupePaths,
  dirnameOf,
  isValidTransferId,
  sanitizeRelativePath,
} from './safePath';

describe('isValidTransferId', () => {
  it('accepts nanoid style ids', () => {
    expect(isValidTransferId('V1StGXR8_Z5j')).toBe(true);
  });

  it('rejects traversal and separators', () => {
    for (const bad of ['..', '../..', 'a/b', 'a\\b', 'short', '', null, 42, 'x'.repeat(40)]) {
      expect(isValidTransferId(bad as unknown)).toBe(false);
    }
  });
});

describe('sanitizeRelativePath', () => {
  it('keeps ordinary nested paths intact', () => {
    expect(sanitizeRelativePath('project/src/index.ts')).toBe('project/src/index.ts');
  });

  it('keeps unicode filenames', () => {
    expect(sanitizeRelativePath('zdjęcia/wakacje ąćę.jpg')).toBe('zdjęcia/wakacje ąćę.jpg');
  });

  it('strips traversal segments', () => {
    expect(sanitizeRelativePath('../../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelativePath('a/../../b')).toBe('a/b');
    expect(sanitizeRelativePath('....//....//x')).toBe('x');
  });

  it('strips absolute and drive prefixes', () => {
    expect(sanitizeRelativePath('/etc/shadow')).toBe('etc/shadow');
    expect(sanitizeRelativePath('C:\\Windows\\System32\\evil.dll')).toBe(
      'Windows/System32/evil.dll',
    );
    expect(sanitizeRelativePath('\\\\server\\share\\file.txt')).toBe('server/share/file.txt');
  });

  it('neutralises windows reserved names and trailing dots', () => {
    expect(sanitizeRelativePath('CON')).toBe('_CON');
    expect(sanitizeRelativePath('nul.txt')).toBe('_nul.txt');
    expect(sanitizeRelativePath('evil.exe.')).toBe('evil.exe');
    expect(sanitizeRelativePath('trailing   ')).toBe('trailing');
  });

  it('removes control characters and windows-illegal bytes', () => {
    const nul = String.fromCharCode(0);
    const lf = String.fromCharCode(10);
    expect(sanitizeRelativePath(`bad${nul}na${lf}me<>:"|?*.txt`)).toBe('bad_na_me_______.txt');
  });

  it('falls back when nothing survives', () => {
    expect(sanitizeRelativePath('../../..')).toBe('file');
    expect(sanitizeRelativePath('')).toBe('file');
    expect(sanitizeRelativePath(undefined)).toBe('file');
  });

  it('caps depth and segment length', () => {
    const deep = Array.from({ length: 80 }, (_, i) => `d${i}`).join('/');
    expect(sanitizeRelativePath(deep).split('/').length).toBeLessThanOrEqual(32);

    const long = `${'x'.repeat(500)}.txt`;
    const result = sanitizeRelativePath(long);
    expect(result.length).toBeLessThanOrEqual(181);
    expect(result.endsWith('.txt')).toBe(true);
  });
});

describe('path helpers', () => {
  it('splits directory and base names', () => {
    expect(dirnameOf('a/b/c.txt')).toBe('a/b');
    expect(dirnameOf('c.txt')).toBe('');
    expect(basenameOf('a/b/c.txt')).toBe('c.txt');
  });

  it('lists ancestors shallowest first', () => {
    expect(ancestorDirs('a/b/c.txt')).toEqual(['a', 'a/b']);
    expect(ancestorDirs('c.txt')).toEqual([]);
  });
});

describe('dedupePaths', () => {
  it('renames collisions like a file manager', () => {
    expect(dedupePaths(['a.txt', 'a.txt', 'a.txt', 'dir/a.txt'])).toEqual([
      'a.txt',
      'a (2).txt',
      'a (3).txt',
      'dir/a.txt',
    ]);
  });

  it('treats case insensitive collisions as collisions', () => {
    expect(dedupePaths(['Photo.JPG', 'photo.jpg'])).toEqual(['Photo.JPG', 'photo (2).jpg']);
  });
});
