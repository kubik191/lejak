import { promises as fs } from "fs";
import path from "path";
import type { Db } from "./types";
import { createSeedDb } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

async function load(): Promise<Db> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw) as Db;
  } catch {
    const db = createSeedDb();
    await save(db);
    return db;
  }
}

async function save(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  const json = JSON.stringify(db, null, 2);
  await fs.writeFile(tmp, json, "utf8");
  try {
    await fs.rename(tmp, DB_FILE);
  } catch {
    // Windows can refuse the rename while another program has the file open.
    await fs.writeFile(DB_FILE, json, "utf8");
    await fs.rm(tmp, { force: true });
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialises all reads/writes so concurrent requests never overwrite each other. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function readDb(): Promise<Db> {
  const run = queue.then(load);
  queue = run.catch(() => undefined);
  return run;
}

export async function resetDb(): Promise<void> {
  await mutate((db) => {
    Object.assign(db, createSeedDb());
  });
}
