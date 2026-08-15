import express from 'express';
import multer from 'multer';
import {
  getOrCreateBrand,
  addReferenceProduct,
  addReferenceImage,
  listBrands,
  listProductsForBrand,
} from '../services/referenceStore.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Simple shared-secret protection. This is intentionally minimal —
 * fine for one or two admins seeding data. If more people manage the
 * database later, replace this with real authentication.
 */
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Missing or invalid admin key.' });
  }
  next();
}

router.use(requireAdminKey);

// List all brands currently in the database.
router.get('/admin/brands', (req, res) => {
  res.json(listBrands());
});

// List reference products for a brand.
router.get('/admin/brands/:brandName/products', (req, res) => {
  res.json(listProductsForBrand(req.params.brandName));
});

// Create a brand + product entry in one call.
// Body: { brand, productName, category?, authenticityNotes? }
router.post('/admin/products', express.json(), (req, res) => {
  const { brand, productName, category, authenticityNotes } = req.body;
  if (!brand || !productName) {
    return res.status(400).json({ error: 'brand and productName are required.' });
  }
  const brandRow = getOrCreateBrand(brand);
  const product = addReferenceProduct({
    brandId: brandRow.id,
    productName,
    category,
    authenticityNotes,
  });
  res.status(201).json(product);
});

// Upload a verified reference image for a product.
// multipart/form-data: image=<file>, productId=<id>, angleTag?, source?
router.post('/admin/reference-images', upload.single('image'), (req, res) => {
  const { productId, angleTag, source } = req.body;
  if (!req.file || !productId) {
    return res.status(400).json({ error: 'image file and productId are required.' });
  }
  const image = addReferenceImage({
    productId: Number(productId),
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    angleTag,
    source,
  });
  res.status(201).json(image);
});

export default router;
