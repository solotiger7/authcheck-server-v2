import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'reference.db');
export const IMAGE_STORAGE_DIR = path.join(DATA_DIR, 'reference-images');

fs.mkdirSync(IMAGE_STORAGE_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS reference_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id),
    product_name TEXT NOT NULL,
    category TEXT,
    authenticity_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reference_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES reference_products(id),
    file_path TEXT NOT NULL,
    angle_tag TEXT,
    -- e.g. 'logo-closeup', 'packaging', 'stitching', 'full-product', 'serial-number'
    source TEXT,
    -- where this reference image came from (e.g. 'official-brand-site', 'verified-purchase')
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_products_brand ON reference_products(brand_id);
  CREATE INDEX IF NOT EXISTS idx_images_product ON reference_images(product_id);
`);
