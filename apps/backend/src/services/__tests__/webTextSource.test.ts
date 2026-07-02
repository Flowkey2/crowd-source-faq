/**
 * webTextSource.test — Phase 5.
 *
 * Unit tests for the 6th default RetrievalSource. MongoMemoryServer
 * bootstrap matches contextRetriever.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Force index sync so the text index is available
  const { default: WebPage } = await import('../../models/WebPage.js');
  await WebPage.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  try {
    await db.collection('yaksha_web_pages').deleteMany({});
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

const { webTextSource } = await import('../retrievalSources/webTextSource.js');
const { default: WebPage } = await import('../../models/WebPage.js');
const { listSources } = await import('../contextRetriever.js');

async function seedPage(overrides: {
  url?: string;
  title?: string;
  text?: string;
  fetchedAt?: Date;
  lastFetchError?: string | null;
  approved?: boolean;
} = {}) {
  const url = overrides.url ?? 'https://docs.example.com/setup';
  const parsed = new URL(url);
  return WebPage.create({
    url,
    domain: parsed.hostname,
    title: overrides.title ?? 'How to set up the dashboard',
    text: overrides.text ?? 'Step one: install dependencies. Step two: configure the environment.',
    source: 'admin_pasted',
    statusCode: 200,
    fetchedAt: overrides.fetchedAt ?? new Date(),
    lastFetchError: overrides.lastFetchError ?? null,
    // Phase 8: retrieval source filters on approved:true. Existing
    // tests assume a row is in the eligible set; default approved
    // to true so the legacy seeded rows remain visible to retrieval.
    approved: overrides.approved ?? true,
  });
}

describe('webTextSource — source registration', () => {
  it('has name=web and weight=0.9', () => {
    expect(webTextSource.name).toBe('web');
    expect(webTextSource.weight).toBe(0.9);
  });

  it('appears in listSources() after auto-register', () => {
    const names = listSources().map((s) => s.name);
    expect(names).toContain('web');
  });
});

describe('webTextSource.search — happy path', () => {
  it('returns hits when $text matches a stored page', async () => {
    await seedPage({ title: 'Reset password guide', text: 'Click forgot password on the login page.' });
    const hits = await webTextSource.search('password', null, { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toBe('web');
    expect(hits[0].answer.toLowerCase()).toContain('password');
    expect(hits[0].matchedOn).toMatch(/WebPage/);
  });

  it('returns [] when no pages exist (no throw)', async () => {
    const hits = await webTextSource.search('anything', null, { topK: 3 });
    expect(hits).toEqual([]);
  });
});

describe('webTextSource.search — freshness decay', () => {
  it('fresh pages (< 7d) get confidence 0.85', async () => {
    await seedPage({ fetchedAt: new Date() });
    const hits = await webTextSource.search('dashboard', null, { topK: 1 });
    expect(hits[0]?.confidence).toBe(0.85);
  });

  it('stale pages (> 7d) get confidence 0.5', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await seedPage({ fetchedAt: old, title: 'Old dashboard guide', text: 'Old dashboard content here.' });
    const hits = await webTextSource.search('dashboard', null, { topK: 1 });
    expect(hits[0]?.confidence).toBe(0.5);
    expect(hits[0]?.meta?.ageDays).toBeGreaterThan(7);
  });
});

describe('webTextSource.search — error path', () => {
  it('returns [] when WebPage.find throws (no upstream crash)', async () => {
    const spy = vi.spyOn(WebPage, 'find').mockImplementation(() => {
      throw new Error('simulated mongo failure');
    });
    const hits = await webTextSource.search('whatever', null, { topK: 3 });
    expect(hits).toEqual([]);
    spy.mockRestore();
  });
});

describe('webTextSource.search — error filter', () => {
  it('excludes pages with lastFetchError set', async () => {
    await seedPage({ url: 'https://broken.example.com', title: 'Broken page setup', text: 'broken content dashboard' });
    await seedPage({ url: 'https://good.example.com', title: 'Good page setup', text: 'good content dashboard' });
    const good = await WebPage.findOne({ url: 'https://broken.example.com' });
    if (good) {
      await WebPage.updateOne({ _id: good._id }, { $set: { lastFetchError: 'HTTP 503' } });
    }
    const hits = await webTextSource.search('dashboard', null, { topK: 10 });
    const urls = hits.map((h) => h.meta?.url);
    expect(urls).not.toContain('https://broken.example.com');
    expect(urls).toContain('https://good.example.com');
  });
});

describe('webTextSource.search — approved filter (Phase 8)', () => {
  it('excludes pages where approved=false', async () => {
    // seed one approved (visible) and one unapproved (hidden) row that
    // both match the same query terms. Only the approved one should
    // appear in results — auto-discovered rows stay out of the
    // retrieval fan-out until an admin flips approved.
    await seedPage({ url: 'https://approved.example.com', title: 'Approved setup', text: 'approved dashboard content', approved: true });
    await seedPage({ url: 'https://pending.example.com', title: 'Pending setup', text: 'pending dashboard content', approved: false });
    const hits = await webTextSource.search('dashboard', null, { topK: 10 });
    const urls = hits.map((h) => h.meta?.url);
    expect(urls).toContain('https://approved.example.com');
    expect(urls).not.toContain('https://pending.example.com');
  });
});