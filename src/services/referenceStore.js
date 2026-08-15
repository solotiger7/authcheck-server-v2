import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, IMAGE_STORAGE_DIR } from '../db/index.js';

/** Case-insensitive brand lookup, used to match a model's brand guess to stored data. */
export function findBrandByName(name) {
  const normalized = name.trim().toLowerCase();
  return db
    .prepare('SELECT * FROM brands WHERE lower(name) = ?')
    .get(normalized);
}

export function listBrands() {
  return db.prepare('SELECT * FROM brands ORDER BY name').all();
}

export function getOrCreateBrand(name, notes = null) {
  const existing = findBrandByName(name);
  if (existing) return existing;
  const info = db
    .prepare('INSERT INTO brands (name, notes) VALUES (?, ?)')
    .run(name.trim(), notes);
  return db.prepare('SELECT * FROM brands WHERE id = ?').get(info.lastInsertRowid);
}

export function addReferenceProduct({ brandId, productName, category, authenticityNotes }) {
  const info = db
    .prepare(
      `INSERT INTO reference_products (brand_id, product_name, category, authenticity_notes)
       VALUES (?, ?, ?, ?)`
    )
    .run(brandId, productName, category ?? null, authenticityNotes ?? null);
  return db.prepare('SELECT * FROM reference_products WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Saves an uploaded reference image to disk and records it in the DB.
 * `buffer` is the raw image bytes (from multer's memory storage).
 */
export function addReferenceImage({ productId, buffer, mimetype, angleTag, source }) {
  const ext = mimetype.split('/')[1] ?? 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(IMAGE_STORAGE_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  const info = db
    .prepare(
      `INSERT INTO reference_images (product_id, file_path, angle_tag, source)
       VALUES (?, ?, ?, ?)`
    )
    .run(productId, filename, angleTag ?? null, source ?? null);

  return db.prepare('SELECT * FROM reference_images WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Finds reference images for a brand (optionally narrowed by product name
 * substring match). Returns up to `limit` images with their file paths
 * resolved to full disk paths, ready to read and send to the AI model.
 */
export function findReferenceImages({ brandName, productNameGuess, limit = 3 }) {
  const brand = findBrandByName(brandName);
  if (!brand) return [];

  let products;
  if (productNameGuess) {
    products = db
      .prepare(
        `SELECT * FROM reference_products
         WHERE brand_id = ? AND lower(product_name) LIKE ?`
      )
      .all(brand.id, `%${productNameGuess.trim().toLowerCase()}%`);
  }
  if (!products || products.length === 0) {
    products = db.prepare('SELECT * FROM reference_products WHERE brand_id = ?').all(brand.id);
  }
  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const placeholders = productIds.map(() => '?').join(',');
  const images = db
    .prepare(
      `SELECT * FROM reference_images WHERE product_id IN (${placeholders}) LIMIT ?`
    )
    .all(...productIds, limit);

  return images.map((img) => ({
    ...img,
    fullPath: path.join(IMAGE_STORAGE_DIR, img.file_path),
  }));
}

export function listProductsForBrand(brandName) {
  const brand = findBrandByName(brandName);
  if (!brand) return [];
  return db.prepare('SELECT * FROM reference_products WHERE brand_id = ?').all(brand.id);
}
