import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import {
  IDENTIFY_PROMPT,
  buildComparisonPrompt,
  parseJsonResponse,
  parseAnalysisResponse,
} from '../analysisPrompt.js';
import { findReferenceImages } from '../services/referenceStore.js';
import { fetchLiveReferenceImages } from '../services/liveImageSearch.js';

const router = express.Router();

// Images are handled in memory (not written to disk) and discarded after
// the request completes — nothing about the customer's product photo is stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-5';

router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const { link } = req.body;
    const image = req.file;

    if (!image && !link) {
      return res.status(400).json({ error: 'Provide an image, a link, or both.' });
    }

    const customerImageBlock = image
      ? {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimetype,
            data: image.buffer.toString('base64'),
          },
        }
      : null;

    // --- Pass 1: identify brand/product, so we can look up references ---
    let brandGuess = '';
    let productGuess = '';
    if (customerImageBlock) {
      const identifyContent = [customerImageBlock, { type: 'text', text: IDENTIFY_PROMPT }];
      const identifyResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: identifyContent }],
      });
      const identifyText = identifyResponse.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      try {
        const identified = parseJsonResponse(identifyText);
        brandGuess = identified.brand ?? '';
        productGuess = identified.productName ?? '';
      } catch {
        // If identification fails to parse, we just proceed without references.
      }
    }

    // --- Look up reference images, two sources, in priority order ---
    // 1. Your own locally-uploaded, rights-cleared reference images (highest trust).
    // 2. Live web image search, held in memory only for this request, discarded after.
    let referenceImageBlocks = [];
    let referenceSourceLabel = null;

    const localRefs = brandGuess
      ? findReferenceImages({ brandName: brandGuess, productNameGuess: productGuess, limit: 3 })
      : [];

    if (localRefs.length > 0) {
      referenceSourceLabel = 'local-verified';
      for (const ref of localRefs) {
        const buf = fs.readFileSync(ref.fullPath);
        const ext = ref.file_path.split('.').pop();
        referenceImageBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            data: buf.toString('base64'),
          },
        });
      }
    } else if (brandGuess) {
      const liveRefs = await fetchLiveReferenceImages({ brand: brandGuess, productName: productGuess });
      if (liveRefs.length > 0) {
        referenceSourceLabel = 'live-search';
        for (const ref of liveRefs) {
          referenceImageBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: ref.buffer.mimeType,
              data: ref.buffer.data.toString('base64'),
            },
          });
        }
      }
      // liveRefs (and their buffers) fall out of scope here — nothing persisted.
    }

    // --- Pass 2: compare against references (or general assessment if none) ---
    const contentBlocks = [];

    if (referenceImageBlocks.length > 0) {
      contentBlocks.push({ type: 'text', text: `Customer's product photo (to be assessed):` });
      if (customerImageBlock) contentBlocks.push(customerImageBlock);

      contentBlocks.push({
        type: 'text',
        text: `Reference image(s) of ${brandGuess} ${productGuess} found via image search, for comparison:`,
      });
      contentBlocks.push(...referenceImageBlocks);
    } else if (customerImageBlock) {
      contentBlocks.push(customerImageBlock);
    }

    let userText = 'Assess this product for authenticity and condition.';
    if (link) {
      userText += ` The listing link is: ${link}. Consider what the URL/domain implies about the seller, if relevant, but do not fabricate details you cannot see.`;
    }
    contentBlocks.push({ type: 'text', text: userText });

    const comparisonPrompt = buildComparisonPrompt({
      hasReferenceImages: referenceImageBlocks.length > 0,
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: comparisonPrompt,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const rawText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const result = parseAnalysisResponse(rawText);
    res.json({
      ...result,
      brandGuess,
      productGuess,
      referencesUsed: referenceImageBlocks.length,
      referenceSource: referenceSourceLabel,
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

export default router;
