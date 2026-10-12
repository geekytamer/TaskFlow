import type Database from 'better-sqlite3';
import { randomUUID as uuid } from 'node:crypto';
import type { ScrapedProfile } from './apify';
import { bioContacts, engagementRate, locationFromBio } from './discover';

export type ProfileStatus = 'candidate' | 'listed' | 'rejected' | 'removed';
export const PROFILE_STATUSES: ProfileStatus[] = ['candidate', 'listed', 'rejected', 'removed'];
export type Gender = 'female' | 'male';

export interface DiscoverProfile {
  id: string;
  companyId: string;
  platform: 'instagram';
  username: string;
  fullName: string | null;
  bio: string | null;
  externalUrl: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  verified: boolean;
  isBusiness: boolean;
  isPrivate: boolean;
  category: string | null;
  engagementRate: number | null;
  hasPhoto: boolean;
  location: string | null;
  gender: Gender | null;
  niche: string | null;
  status: ProfileStatus;
  source: 'discovery' | 'manual';
  contactId: string | null;
  /** One of Peak's own influencers, synced from their record: outside the 200 and never suggested by discovery. */
  isRoster: boolean;
  emails: string[];
  phones: string[];
  lastFetchedAt: string | null;
  fetchError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverRun {
  id: string;
  companyId: string;
  kind: 'refresh' | 'discovery';
  status: 'running' | 'done' | 'failed' | 'refused';
  startedAt: string;
  finishedAt: string | null;
  results: number;
  message: string | null;
}

export interface DiscoverSettings {
  hashtags: string[];
  minFollowers: number;
  perHashtag: number;
}

export const DEFAULT_SETTINGS: DiscoverSettings = {
  hashtags: ['muscat', 'oman', 'omani', 'omaninfluencer', 'عمان', 'مسقط'],
  minFollowers: 10_000,
  perHashtag: 50,
};

/** Who can edit what on a profile. */
export interface ProfilePatch {
  status?: ProfileStatus;
  location?: string | null;
  gender?: Gender | null;
  niche?: string | null;
  contactId?: string | null;
}

const COLUMNS = `id, companyId, platform, username, fullName, bio, externalUrl, followers, following, posts, verified, isBusiness,
  isPrivate, category, engagementRate, photo IS NOT NULL AS hasPhoto, location, gender, niche, status, source, contactId, isRoster, emails, phones,
  lastFetchedAt, fetchError, createdAt, updatedAt`;

const decode = (row: any): DiscoverProfile => ({
  ...row,
  verified: row.verified === 1,
  isBusiness: row.isBusiness === 1,
  isPrivate: row.isPrivate === 1,
  hasPhoto: row.hasPhoto === 1,
  isRoster: row.isRoster === 1,
  emails: row.emails ? JSON.parse(row.emails) : [],
  phones: row.phones ? JSON.parse(row.phones) : [],
});

export class DiscoverStore {
  constructor(private readonly db: Database.Database) {}

  list(companyId: string, status?: ProfileStatus): DiscoverProfile[] {
    const rows = status
      ? this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE companyId = ? AND status = ? ORDER BY followers DESC, username`).all(companyId, status)
      : this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE companyId = ? ORDER BY followers DESC, username`).all(companyId);
    return (rows as any[]).map(decode);
  }

  get(id: string): DiscoverProfile | undefined {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE id = ?`).get(id);
    return row ? decode(row) : undefined;
  }

  byUsername(companyId: string, username: string): DiscoverProfile | undefined {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE companyId = ? AND platform = 'instagram' AND username = ?`).get(companyId, username);
    return row ? decode(row) : undefined;
  }

  /** Every handle the directory has seen, whatever its status: discovery never suggests them again. */
  knownUsernames(companyId: string): Set<string> {
    return new Set((this.db.prepare('SELECT username FROM discover_profiles WHERE companyId = ?').all(companyId) as Array<{ username: string }>).map((r) => r.username));
  }

  /** Handles staff typed in: listed straight away, filled in by the next fetch. Existing ones are left as they are. */
  addHandles(companyId: string, usernames: string[], status: ProfileStatus = 'listed'): DiscoverProfile[] {
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO discover_profiles (id, companyId, platform, username, status, source, createdAt, updatedAt)
       VALUES (?, ?, 'instagram', ?, ?, 'manual', ?, ?)`,
    );
    this.db.transaction(() => usernames.forEach((u) => insert.run(uuid(), companyId, u, status, now, now)))();
    return usernames.map((u) => this.byUsername(companyId, u)!).filter(Boolean);
  }

  /**
   * Saves what a fetch returned: figures, a dated snapshot, contacts from the
   * bio, and the photo when one came. A new account is created with `ifNew`.
   */
  saveFetched(companyId: string, p: ScrapedProfile, photo: { bytes: Buffer; type: string } | null, ifNew: { status: ProfileStatus; source: 'discovery' | 'manual' }, now = new Date()): DiscoverProfile {
    const at = now.toISOString();
    const existing = this.byUsername(companyId, p.username);
    const contacts = bioContacts(p.bio);
    const values = {
      fullName: p.fullName, bio: p.bio, externalUrl: p.externalUrl, followers: p.followers, following: p.following, posts: p.posts,
      verified: p.verified ? 1 : 0, isBusiness: p.isBusiness ? 1 : 0, isPrivate: p.isPrivate ? 1 : 0, category: p.category,
      engagementRate: engagementRate(p.followers, p.recentPosts), emails: JSON.stringify(contacts.emails), phones: JSON.stringify(contacts.phones),
      lastFetchedAt: at, updatedAt: at,
    };
    const id = existing?.id ?? uuid();
    this.db.transaction(() => {
      if (existing) {
        this.db.prepare(`UPDATE discover_profiles SET fullName=@fullName, bio=@bio, externalUrl=@externalUrl, followers=@followers, following=@following,
          posts=@posts, verified=@verified, isBusiness=@isBusiness, isPrivate=@isPrivate, category=@category, engagementRate=@engagementRate,
          emails=@emails, phones=@phones, lastFetchedAt=@lastFetchedAt, fetchError=NULL, updatedAt=@updatedAt,
          location=COALESCE(location, @location) WHERE id=@id`).run({ ...values, id, location: locationFromBio(p.bio) });
      } else {
        this.db.prepare(`INSERT INTO discover_profiles (id, companyId, platform, username, fullName, bio, externalUrl, followers, following, posts,
          verified, isBusiness, isPrivate, category, engagementRate, emails, phones, lastFetchedAt, location, status, source, createdAt, updatedAt)
          VALUES (@id, @companyId, 'instagram', @username, @fullName, @bio, @externalUrl, @followers, @following, @posts, @verified, @isBusiness,
          @isPrivate, @category, @engagementRate, @emails, @phones, @lastFetchedAt, @location, @status, @source, @createdAt, @updatedAt)`)
          .run({ ...values, id, companyId, username: p.username, location: locationFromBio(p.bio), status: ifNew.status, source: ifNew.source, createdAt: at });
      }
      if (photo) this.db.prepare('UPDATE discover_profiles SET photo = ?, photoType = ? WHERE id = ?').run(photo.bytes, photo.type, id);
      this.db.prepare('INSERT OR REPLACE INTO discover_snapshots (profileId, takenAt, followers, following, posts) VALUES (?, ?, ?, ?, ?)')
        .run(id, at, p.followers, p.following, p.posts);
    })();
    return this.get(id)!;
  }

  /** A fetch that came back without this account (deleted, renamed or private). */
  markMissing(id: string, reason: string, now = new Date()): void {
    this.db.prepare('UPDATE discover_profiles SET fetchError = ?, lastFetchedAt = ?, updatedAt = ? WHERE id = ?')
      .run(reason, now.toISOString(), now.toISOString(), id);
  }

  /**
   * A snapshot of past figures that staff enter once (for example from a
   * screenshot), so growth shows before three months of fetching have passed.
   */
  addPastSnapshot(id: string, followers: number, takenAt: string): void {
    this.db.prepare('INSERT OR REPLACE INTO discover_snapshots (profileId, takenAt, followers, following, posts) VALUES (?, ?, ?, NULL, NULL)')
      .run(id, takenAt, followers);
  }

  snapshots(profileId: string): Array<{ followers: number; takenAt: string }> {
    return this.db.prepare('SELECT followers, takenAt FROM discover_snapshots WHERE profileId = ? ORDER BY takenAt').all(profileId) as Array<{ followers: number; takenAt: string }>;
  }

  photo(id: string): { bytes: Buffer; type: string } | undefined {
    const row = this.db.prepare('SELECT photo, photoType FROM discover_profiles WHERE id = ?').get(id) as { photo: Buffer | null; photoType: string | null } | undefined;
    return row?.photo && row.photoType ? { bytes: row.photo, type: row.photoType } : undefined;
  }

  update(id: string, patch: ProfilePatch): DiscoverProfile | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    this.db.prepare('UPDATE discover_profiles SET status=?, location=?, gender=?, niche=?, contactId=?, updatedAt=? WHERE id=?')
      .run(next.status, next.location, next.gender, next.niche, next.contactId, new Date().toISOString(), id);
    return this.get(id);
  }

  /** Listed and candidate profiles not fetched for `days`, oldest first. Removed and rejected ones are never fetched. */
  dueForRefresh(companyId: string, days: number, limit: number, now = new Date()): DiscoverProfile[] {
    const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    return (this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE companyId = ? AND status IN ('listed', 'candidate')
      AND (lastFetchedAt IS NULL OR lastFetchedAt < ?) ORDER BY lastFetchedAt IS NOT NULL, lastFetchedAt LIMIT ?`).all(companyId, before, limit) as any[]).map(decode);
  }

  /** Profiles that use the directory's 200: listed and candidate ones, not Peak's own roster. */
  countActive(companyId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM discover_profiles WHERE companyId = ? AND status IN ('listed', 'candidate') AND isRoster = 0").get(companyId) as { n: number }).n;
  }

  rosterProfiles(companyId: string): DiscoverProfile[] {
    return (this.db.prepare(`SELECT ${COLUMNS} FROM discover_profiles WHERE companyId = ? AND isRoster = 1`).all(companyId) as any[]).map(decode);
  }

  /**
   * Makes `username` the directory entry of a roster influencer: created if new,
   * otherwise linked, flagged and listed (being on Peak's roster wins over an
   * earlier rejection by discovery).
   */
  linkRoster(companyId: string, username: string, contactId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT OR IGNORE INTO discover_profiles (id, companyId, platform, username, status, source, createdAt, updatedAt)
      VALUES (?, ?, 'instagram', ?, 'listed', 'manual', ?, ?)`).run(uuid(), companyId, username, now, now);
    this.db.prepare(`UPDATE discover_profiles SET contactId = ?, isRoster = 1, status = 'listed', updatedAt = ?
      WHERE companyId = ? AND platform = 'instagram' AND username = ? AND (contactId IS NOT ? OR isRoster = 0 OR status != 'listed')`)
      .run(contactId, now, companyId, username, contactId);
  }

  /** A roster influencer's latest scraped Instagram figures, when there are any. */
  rosterFigure(companyId: string, contactId: string): { username: string; followers: number; asOf: string } | null {
    const row = this.db.prepare(`SELECT username, followers, lastFetchedAt FROM discover_profiles
      WHERE companyId = ? AND contactId = ? AND isRoster = 1 AND followers IS NOT NULL AND lastFetchedAt IS NOT NULL
      ORDER BY lastFetchedAt DESC LIMIT 1`).get(companyId, contactId) as { username: string; followers: number; lastFetchedAt: string } | undefined;
    return row ? { username: row.username, followers: row.followers, asOf: row.lastFetchedAt.slice(0, 10) } : null;
  }

  /** No longer a roster influencer's account (left the roster or changed handle): an ordinary entry again. */
  unlinkRoster(id: string): void {
    this.db.prepare('UPDATE discover_profiles SET contactId = NULL, isRoster = 0, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  // ─── runs and budget ───────────────────────────────────────────────────────

  startRun(companyId: string, kind: DiscoverRun['kind']): DiscoverRun {
    const run: DiscoverRun = { id: uuid(), companyId, kind, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, results: 0, message: null };
    this.db.prepare('INSERT INTO discover_runs (id, companyId, kind, status, startedAt, finishedAt, results, message) VALUES (@id, @companyId, @kind, @status, @startedAt, @finishedAt, @results, @message)').run(run);
    return run;
  }

  finishRun(id: string, status: Exclude<DiscoverRun['status'], 'running'>, results: number, message: string | null): void {
    this.db.prepare('UPDATE discover_runs SET status = ?, results = ?, message = ?, finishedAt = ? WHERE id = ?')
      .run(status, results, message, new Date().toISOString(), id);
  }

  /** A run left 'running' by a restart is closed as failed, so a new one can start. */
  closeStaleRuns(companyId: string): void {
    this.db.prepare("UPDATE discover_runs SET status = 'failed', message = 'Interrupted by a restart.', finishedAt = ? WHERE companyId = ? AND status = 'running'")
      .run(new Date().toISOString(), companyId);
  }

  runs(companyId: string, limit = 20): DiscoverRun[] {
    return this.db.prepare('SELECT * FROM discover_runs WHERE companyId = ? ORDER BY startedAt DESC LIMIT ?').all(companyId, limit) as DiscoverRun[];
  }

  running(companyId: string): DiscoverRun | undefined {
    return this.db.prepare("SELECT * FROM discover_runs WHERE companyId = ? AND status = 'running' LIMIT 1").get(companyId) as DiscoverRun | undefined;
  }

  lastRun(companyId: string, kind: DiscoverRun['kind']): DiscoverRun | undefined {
    return this.db.prepare("SELECT * FROM discover_runs WHERE companyId = ? AND kind = ? AND status IN ('done', 'failed') ORDER BY startedAt DESC LIMIT 1")
      .get(companyId, kind) as DiscoverRun | undefined;
  }

  /** Apify results billed this calendar month (UTC). */
  resultsThisMonth(companyId: string, now = new Date()): number {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    return (this.db.prepare('SELECT COALESCE(SUM(results), 0) AS n FROM discover_runs WHERE companyId = ? AND startedAt >= ?').get(companyId, monthStart) as { n: number }).n;
  }

  // ─── settings ──────────────────────────────────────────────────────────────

  settings(companyId: string): DiscoverSettings {
    const row = this.db.prepare('SELECT hashtags, minFollowers, perHashtag FROM discover_settings WHERE companyId = ?').get(companyId) as
      | { hashtags: string; minFollowers: number; perHashtag: number } | undefined;
    return row ? { hashtags: JSON.parse(row.hashtags), minFollowers: row.minFollowers, perHashtag: row.perHashtag } : { ...DEFAULT_SETTINGS };
  }

  setSettings(companyId: string, s: DiscoverSettings): DiscoverSettings {
    this.db.prepare(`INSERT INTO discover_settings (companyId, hashtags, minFollowers, perHashtag, updatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (companyId) DO UPDATE SET hashtags = excluded.hashtags, minFollowers = excluded.minFollowers, perHashtag = excluded.perHashtag, updatedAt = excluded.updatedAt`)
      .run(companyId, JSON.stringify(s.hashtags), s.minFollowers, s.perHashtag, new Date().toISOString());
    return this.settings(companyId);
  }

  // ─── client interest ───────────────────────────────────────────────────────

  /** Records a client's request for a profile once; returns false when it was already recorded. */
  recordInterest(input: { companyId: string; profileId: string; clientContactId: string; portalUserId: string; followupId: string | null }): boolean {
    const res = this.db.prepare(`INSERT OR IGNORE INTO discover_interests (id, companyId, profileId, clientContactId, portalUserId, followupId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuid(), input.companyId, input.profileId, input.clientContactId, input.portalUserId, input.followupId, new Date().toISOString());
    return res.changes === 1;
  }

  requestedBy(clientContactId: string): Set<string> {
    return new Set((this.db.prepare('SELECT profileId FROM discover_interests WHERE clientContactId = ?').all(clientContactId) as Array<{ profileId: string }>).map((r) => r.profileId));
  }

  interestCount(profileId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM discover_interests WHERE profileId = ?').get(profileId) as { n: number }).n;
  }
}

/** The tables, created by migration 126. */
export const DISCOVER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS discover_profiles (
    id             TEXT PRIMARY KEY,
    companyId      TEXT NOT NULL,
    platform       TEXT NOT NULL DEFAULT 'instagram',
    username       TEXT NOT NULL,
    fullName       TEXT,
    bio            TEXT,
    externalUrl    TEXT,
    followers      INTEGER,
    following      INTEGER,
    posts          INTEGER,
    verified       INTEGER NOT NULL DEFAULT 0,
    isBusiness     INTEGER NOT NULL DEFAULT 0,
    isPrivate      INTEGER NOT NULL DEFAULT 0,
    category       TEXT,
    engagementRate REAL,
    photo          BLOB,
    photoType      TEXT,
    location       TEXT,
    gender         TEXT CHECK (gender IN ('female', 'male')),
    niche          TEXT,
    status         TEXT NOT NULL CHECK (status IN ('candidate', 'listed', 'rejected', 'removed')),
    source         TEXT NOT NULL CHECK (source IN ('discovery', 'manual')),
    contactId      TEXT,
    emails         TEXT,
    phones         TEXT,
    lastFetchedAt  TEXT,
    fetchError     TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL,
    UNIQUE (companyId, platform, username)
  );
  CREATE INDEX IF NOT EXISTS idx_discover_profiles_status ON discover_profiles (companyId, status);
  CREATE TABLE IF NOT EXISTS discover_snapshots (
    profileId TEXT NOT NULL,
    takenAt   TEXT NOT NULL,
    followers INTEGER NOT NULL,
    following INTEGER,
    posts     INTEGER,
    PRIMARY KEY (profileId, takenAt)
  );
  CREATE TABLE IF NOT EXISTS discover_runs (
    id         TEXT PRIMARY KEY,
    companyId  TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('refresh', 'discovery')),
    status     TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed', 'refused')),
    startedAt  TEXT NOT NULL,
    finishedAt TEXT,
    results    INTEGER NOT NULL DEFAULT 0,
    message    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_discover_runs_company ON discover_runs (companyId, startedAt);
  CREATE TABLE IF NOT EXISTS discover_settings (
    companyId   TEXT PRIMARY KEY,
    hashtags    TEXT NOT NULL,
    minFollowers INTEGER NOT NULL,
    perHashtag  INTEGER NOT NULL,
    updatedAt   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discover_interests (
    id              TEXT PRIMARY KEY,
    companyId       TEXT NOT NULL,
    profileId       TEXT NOT NULL,
    clientContactId TEXT NOT NULL,
    portalUserId    TEXT NOT NULL,
    followupId      TEXT,
    createdAt       TEXT NOT NULL,
    UNIQUE (profileId, clientContactId)
  );
`;
