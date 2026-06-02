/**
 * @file lib/blobStorage.js
 * @description Azure Blob Storage service for sign placement photos.
 *
 * Authentication: uses DefaultAzureCredential — in production this resolves
 * to the App Service's managed identity (which has Storage Blob Data
 * Contributor on the storage account); in development it falls back to
 * Azure CLI credentials (run `az login` to authenticate).
 *
 * Container: photos go into the `sign-photos` container with private
 * (no anonymous) access. Reads are gated by an authenticated proxy route
 * in signsRoutes.js, not direct public URLs.
 *
 * Blob naming convention: `{placement_id}-{timestamp}.{ext}`. The
 * placement_id prefix makes it easy to find/delete all photos for a
 * placement at the storage-browser level if needed. The timestamp
 * suffix prevents collisions if a placement's photo is re-uploaded.
 *
 * The blob name (NOT the full URL) is what gets stored in the
 * `sign_placements.photo_url` column. The proxy route assembles the URL
 * at read time.
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import sharp from "sharp";
import { getConfig } from "../src/config/azureConfig.js";

/** Name of the blob container holding sign photos. */
const CONTAINER_NAME = "sign-photos";

/** Maximum allowed image dimension (px) after resize. */
const MAX_DIMENSION = 1600;

/** JPEG quality (1-100) for recompressed output. */
const JPEG_QUALITY = 85;

/** Cache the BlobServiceClient + container client so we don't reinit on every call. */
let _blobService = null;
let _containerClient = null;

/**
 * Get (or lazy-create) the cached BlobServiceClient + container client.
 * Returns null if the storage account isn't configured.
 *
 * azureConfig exposes CONFIG via an async getConfig() — we await it
 * here on first use and cache the resolved clients so subsequent
 * uploads/downloads are synchronous after the first hit.
 *
 * @returns {Promise<{ service: import('@azure/storage-blob').BlobServiceClient, container: import('@azure/storage-blob').ContainerClient } | null>}
 */
async function getClients() {
    if (_blobService && _containerClient) {
        return { service: _blobService, container: _containerClient };
    }

    const CONFIG = await getConfig();
    const account = CONFIG.SIGN_PHOTOS_STORAGE_ACCOUNT;
    if (!account) {
        return null;
    }

    const credential = new DefaultAzureCredential();
    const url = `https://${account}.blob.core.windows.net`;
    _blobService = new BlobServiceClient(url, credential);
    _containerClient = _blobService.getContainerClient(CONTAINER_NAME);
    return { service: _blobService, container: _containerClient };
}

/**
 * Pick a safe file extension based on the recompressed image. We always
 * output JPEG to keep the contract simple — `sharp` accepts JPEG, PNG,
 * WebP, HEIC, GIF, AVIF, TIFF on input and we normalise the output.
 *
 * @returns {string}
 */
function outputExtension() {
  return "jpg";
}

/**
 * Process an incoming image buffer with `sharp`: auto-rotate based on EXIF,
 * downscale to fit within MAX_DIMENSION x MAX_DIMENSION, strip EXIF metadata
 * (privacy + size), and encode as JPEG at JPEG_QUALITY.
 *
 * @param {Buffer} buffer  Raw uploaded bytes.
 * @returns {Promise<Buffer>} Processed JPEG bytes.
 */
export async function processImage(buffer) {
  const processed = await sharp(buffer)
    .rotate() // Honour EXIF Orientation tag before stripping it
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true, // better compression at same quality
    })
    .toBuffer();
  return processed;
}

/**
 * Upload an image buffer for a placement. The input is processed
 * (resized/recompressed) before upload. The resulting blob name is
 * returned and should be stored in sign_placements.photo_url.
 *
 * @param {number} placementId   Numeric placement id.
 * @param {Buffer} buffer        Raw image bytes from the client upload.
 * @returns {Promise<string>}    The blob name (e.g. "42-1748812345.jpg").
 * @throws {Error} if storage is not configured or the upload fails.
 */
export async function uploadSignPhoto(placementId, buffer) {
  const clients = await getClients();
  if (!clients) {
    throw new Error("SIGN_PHOTOS_STORAGE_ACCOUNT is not configured.");
  }
  const processedBuffer = await processImage(buffer);

  const ext = outputExtension();
  const blobName = `${placementId}-${Date.now()}.${ext}`;
  const blockBlob = clients.container.getBlockBlobClient(blobName);

  await blockBlob.uploadData(processedBuffer, {
    blobHTTPHeaders: {
      blobContentType: "image/jpeg",
      blobCacheControl: "private, max-age=3600",
    },
  });

  return blobName;
}

/**
 * Stream a blob's bytes to an Express response. Sets Content-Type and
 * Cache-Control headers from the blob's stored properties.
 *
 * @param {string} blobName  Name returned from uploadSignPhoto().
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 * @throws {Error} if storage is not configured or the blob doesn't exist.
 */
export async function streamSignPhotoToResponse(blobName, res) {
  const clients = await getClients();
  if (!clients) {
    throw new Error("SIGN_PHOTOS_STORAGE_ACCOUNT is not configured.");
  }

  const blob = clients.container.getBlobClient(blobName);
  const exists = await blob.exists();
  if (!exists) {
    throw new Error(`Blob not found: ${blobName}`);
  }

  const props = await blob.getProperties();
  res.setHeader("Content-Type", props.contentType || "image/jpeg");
  res.setHeader(
    "Cache-Control",
    // Private + browser-side caching; volunteers reload the map often
    // and the photo is unchanged 99% of the time. Bump the etag check
    // on a re-upload by changing the blob name (we always do).
    "private, max-age=3600",
  );
  res.setHeader("Content-Length", String(props.contentLength));

  const downloadResponse = await blob.download(0);
  if (!downloadResponse.readableStreamBody) {
    throw new Error("Blob download returned no stream.");
  }
  downloadResponse.readableStreamBody.pipe(res);
  await new Promise((resolve, reject) => {
    downloadResponse.readableStreamBody.on("end", resolve);
    downloadResponse.readableStreamBody.on("error", reject);
  });
}

/**
 * Permanently delete a sign-photo blob. Safe to call even if the blob
 * doesn't exist (returns false in that case rather than throwing).
 *
 * @param {string} blobName
 * @returns {Promise<boolean>} True if a blob was deleted, false if it didn't exist.
 */
export async function deleteSignPhoto(blobName) {
  const clients = await getClients();
  if (!clients) {
    throw new Error("SIGN_PHOTOS_STORAGE_ACCOUNT is not configured.");
  }
  const blob = clients.container.getBlobClient(blobName);
  const result = await blob.deleteIfExists();
  return result.succeeded === true;
}

/**
 * Quick check used by health probes / debugging — verifies the container
 * is reachable with the current credentials.
 *
 * @returns {Promise<boolean>}
 */
export async function checkBlobAccess() {
  const clients = await getClients();
  if (!clients) return false;
  try {
    return await clients.container.exists();
  } catch {
    return false;
  }
}
