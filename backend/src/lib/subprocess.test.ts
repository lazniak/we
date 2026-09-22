import { describe, expect, it } from 'bun:test';
import { runBuffer, Semaphore, SingleFlight } from './subprocess';

const BUN = process.execPath;

/** A task that runs until released, recording when it started. */
function gate(log: string[], name: string) {
  let release!: () => void;
  const done = new Promise<void>((resolve) => (release = resolve));
  const task = async () => {
    log.push(name);
    await done;
  };
  return { task, release };
}

describe('Semaphore', () => {
  it('never runs more tasks than its limit, even with a newcomer racing a release', async () => {
    const limiter = new Semaphore(1);
    let active = 0;
    let peak = 0;
    const work = async () => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(1);
      active--;
    };

    let release!: () => void;
    const first = limiter.run(() => new Promise<void>((resolve) => (release = resolve)));
    const waiter = limiter.run(work);

    // The newcomer arrives in the microtask right after the slot is freed,
    // before the queued waiter has resumed.
    release();
    const newcomer = Promise.resolve().then(() => limiter.run(work));
    await Promise.all([first, waiter, newcomer]);

    expect(peak).toBe(1);
  });

  it('lets queued normal work ahead of low-priority work', async () => {
    const limiter = new Semaphore(1);
    const log: string[] = [];

    const busy = gate(log, 'busy');
    const running = limiter.run(busy.task);

    const low = limiter.run(async () => void log.push('low'), 'low');
    const high1 = limiter.run(async () => void log.push('high1'));
    const high2 = limiter.run(async () => void log.push('high2'));

    busy.release();
    await Promise.all([running, low, high1, high2]);

    expect(log).toEqual(['busy', 'high1', 'high2', 'low']);
  });

  it('counts the tasks waiting for a slot', async () => {
    const limiter = new Semaphore(1);
    const busy = gate([], 'busy');
    const running = limiter.run(busy.task);
    const queued = [limiter.run(async () => {}), limiter.run(async () => {}, 'low')];
    expect(limiter.waiting).toBe(2);

    busy.release();
    await Promise.all([running, ...queued]);
    expect(limiter.waiting).toBe(0);
  });
});

describe('SingleFlight', () => {
  it('shares one run per key and reports it while it is in flight', async () => {
    const flight = new SingleFlight<number>();
    let runs = 0;
    let release!: () => void;
    const task = () =>
      new Promise<number>((resolve) => {
        runs++;
        release = () => resolve(7);
      });

    const a = flight.run('k', task);
    const b = flight.run('k', task);
    expect(flight.has('k')).toBe(true);
    release();

    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(runs).toBe(1);
    expect(flight.has('k')).toBe(false);
  });
});

describe('runBuffer', () => {
  it('returns what the command wrote', async () => {
    const out = await runBuffer([BUN, '-e', 'process.stdout.write("hello")'], 10_000, 1024);
    expect(Buffer.from(out!).toString()).toBe('hello');
  });

  it('gives up on output past its cap', async () => {
    const out = await runBuffer([BUN, '-e', 'process.stdout.write("x".repeat(100000))'], 10_000, 1000);
    expect(out).toBeNull();
  });

  it('stops a command at its timeout', async () => {
    const started = performance.now();
    expect(await runBuffer([BUN, '-e', 'setTimeout(() => {}, 20000)'], 300, 1024)).toBeNull();
    expect(performance.now() - started).toBeLessThan(4000);
  });

  it('does not wait for a helper that keeps the pipe open', async () => {
    // The command exits at once, but a detached child it started inherits
    // stdout and would hold it open for 8 s.
    const script = `
      const { spawn } = require('child_process');
      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: 'inherit', detached: true }).unref();
      process.stdout.write('partial');
    `;
    const started = performance.now();
    expect(await runBuffer([BUN, '-e', script], 500, 1024)).toBeNull();
    expect(performance.now() - started).toBeLessThan(4000);
  });
});
