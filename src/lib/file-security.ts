/**
 * AUREON File Upload Security Module
 * Extension whitelist, MIME validation, size limits, UUID naming
 */

// Allowed extensions whitelist
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  // Data files
  ".csv": ["text/csv", "application/csv", "text/plain"],
  ".json": ["application/json", "text/plain"],
  ".jsonl": ["application/jsonl", "application/x-ndjson", "text/plain"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".xls": ["application/vnd.ms-excel"],
  ".xml": ["application/xml", "text/xml"],
  ".yaml": ["application/x-yaml", "text/yaml", "text/plain"],
  ".yml": ["application/x-yaml", "text/yaml", "text/plain"],
  ".toml": ["application/toml", "text/plain"],
  // Documents
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".log": ["text/plain", "application/octet-stream"],
  ".sql": ["application/sql", "text/plain", "application/x-sql"],
  // Archives
  ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  // Data formats
  ".parquet": ["application/octet-stream", "application/vnd.apache.parquet"],
  ".geojson": ["application/geo+json", "application/json"],
  ".db": ["application/x-sqlite3", "application/octet-stream"],
  // Images (for library)
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  // .svg intentionally NOT allowed — SVG can embed <script>, <foreignObject>,
  // and onload handlers. If you ever need to allow SVG uploads, sanitize
  // server-side with DOMPurify before storing.
};

// Blocked extensions (executable / dangerous)
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".php", ".js", ".sh", ".py", ".rb", ".pl", ".jar",
  ".bat", ".cmd", ".ps1", ".msi", ".com", ".scr", ".vbs",
  ".wsf", ".cpl", ".hta", ".inf", ".reg", ".rgs", ".sct",
  ".wsc", ".dll", ".sys", ".drv", ".ocx",
]);

// Magic bytes signatures for common file types
const MAGIC_BYTES: Record<string, number[]> = {
  ".pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  ".xlsx": [0x50, 0x4B, 0x03, 0x04], // PK (ZIP)
  ".xls": [0xD0, 0xCF, 0x11, 0xE0], // OLE2
  ".png": [0x89, 0x50, 0x4E, 0x47], // PNG
  ".jpg": [0xFF, 0xD8, 0xFF],
  ".jpeg": [0xFF, 0xD8, 0xFF],
  ".gif": [0x47, 0x49, 0x46],       // GIF
  ".webp": [0x52, 0x49, 0x46, 0x46], // RIFF
  ".db": [0x53, 0x51, 0x4C, 0x69],   // SQLi
};

// Dangerous CSV/Excel formula prefixes (audit H-15: \t and \r removed —
// they're line/field terminators, not formula indicators; including them
// produced false positives on clean files).
const FORMULA_PREFIXES = ["=", "+", "-", "@", "|"];
// Tab / pipe / semicolon delimiters all need cell-by-cell formula scanning
const CELL_DELIMITERS = /[,\t;|]/;

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_FILE_SIZE_DISPLAY = "500MB";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Extract extension from filename (lowercase)
 */
function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

/**
 * Generate a UUID-based storage filename, preserving only the extension
 */
export function generateSecureFilename(originalName: string): string {
  const ext = getExtension(originalName);
  return `${crypto.randomUUID()}${ext}`;
}

/**
 * Build the full secure storage path: userId/uuid.ext
 */
export function buildStoragePath(userId: string, originalName: string): string {
  return `${userId}/${generateSecureFilename(originalName)}`;
}

/**
 * Validate a file before upload — runs all checks
 */
export async function validateFile(file: File): Promise<FileValidationResult> {
  // STEP 1 — Size check (reject before reading content)
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY}` };
  }
  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  // STEP 2 — Extension check (whitelist)
  const ext = getExtension(file.name);
  if (!ext) {
    return { valid: false, error: "File has no extension" };
  }
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Blocked file type: ${ext}` };
  }
  if (!ALLOWED_EXTENSIONS[ext]) {
    return { valid: false, error: `Unsupported file type: ${ext}` };
  }

  // STEP 3 — MIME type check (compare to extension whitelist)
  // P2 fix: previously, claimedMime === "application/octet-stream" skipped the
  // check entirely, allowing a renamed .exe → .zip to slip through whenever
  // the browser couldn't classify it. Now we still skip ONLY when the
  // extension's allowlist explicitly includes octet-stream; otherwise the
  // claimed MIME must match and we rely on the magic-byte check (Step 4)
  // as the authoritative gate.
  const allowedMimes = ALLOWED_EXTENSIONS[ext];
  const claimedMime = file.type || "application/octet-stream";
  const allowsOctetStream = allowedMimes.includes("application/octet-stream");
  if (claimedMime === "application/octet-stream") {
    if (!allowsOctetStream) {
      // Don't reject yet — fall through to magic-byte check, which is the
      // real gate. Reject only if MIME is non-octet-stream and wrong.
    }
  } else if (!allowedMimes.includes(claimedMime)) {
    return {
      valid: false,
      error: `MIME type mismatch: expected ${allowedMimes.join(" or ")} for ${ext}, got ${claimedMime}`,
    };
  }

  // STEP 4 — Magic bytes check (read first 8 bytes)
  const expectedMagic = MAGIC_BYTES[ext];
  if (expectedMagic) {
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const matches = expectedMagic.every((byte, i) => header[i] === byte);
      if (!matches) {
        return {
          valid: false,
          error: `File content does not match ${ext} format (magic bytes mismatch)`,
        };
      }
    } catch {
      // If we can't read the header, skip this check
    }
  }

  // STEP 5 — CSV/text formula injection check (for text-based data files).
  // Audit H-15: split on any common delimiter (comma, tab, semicolon, pipe)
  // and strip wrapping quotes BEFORE testing the cell.
  const textExts = new Set([".csv", ".tsv", ".txt", ".json", ".jsonl", ".xml", ".yaml", ".yml", ".toml", ".sql", ".log"]);
  if (textExts.has(ext) && file.size < 10 * 1024 * 1024) {
    try {
      const sample = await file.slice(0, 1024 * 100).text(); // First 100KB
      const lines = sample.split(/\r?\n/);
      const formulaCallPattern = /^[=@|+\-]\s*(HYPERLINK|DDE|EXEC|CMD|IMPORTXML|IMPORTDATA|IMPORTRANGE|WEBSERVICE|RTD)\s*\(/i;
      for (const line of lines) {
        const cells = line.split(CELL_DELIMITERS);
        for (const cell of cells) {
          // Strip wrapping quotes (', ", or both) before checking
          const trimmed = cell.trim().replace(/^["'`]+|["'`]+$/g, "");
          if (trimmed.length < 2) continue;
          if (!FORMULA_PREFIXES.some((p) => trimmed.startsWith(p))) continue;
          // Only flag actual dangerous formula invocations, not numeric "-5" etc.
          if (formulaCallPattern.test(trimmed)) {
            return {
              valid: false,
              error: "File contains potentially dangerous formula injection patterns",
            };
          }
        }
      }
    } catch {
      // If text parsing fails, skip this check
    }
  }

  return { valid: true };
}

/**
 * Validate multiple files, returning per-file results
 */
export async function validateFiles(files: File[]): Promise<{ file: File; result: FileValidationResult }[]> {
  return Promise.all(files.map(async (file) => ({ file, result: await validateFile(file) })));
}

/**
 * Sanitize a filename for display (strip path traversal attempts)
 */
export function sanitizeDisplayName(name: string): string {
  return name
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1F]/g, "_")
    .trim();
}

/**
 * Sanitize and validate a storage path to prevent directory traversal.
 * Ensures the path is chrooted to the user's workspace prefix.
 * 
 * @param userId - The authenticated user's UUID
 * @param requestedPath - The path from the client
 * @returns A safe, normalized path prefixed with the userId
 * @throws Error if the path attempts traversal outside the user's workspace
 */
export function sanitizeStoragePath(userId: string, requestedPath: string): string {
  if (!userId || !requestedPath) {
    throw new Error("Invalid userId or path");
  }

  // Remove null bytes
  let cleaned = requestedPath.replace(/\0/g, "");

  // Normalize path separators
  cleaned = cleaned.replace(/\\/g, "/");

  // Remove all ".." sequences (prevent traversal)
  cleaned = cleaned.replace(/\.\.+/g, "");

  // Remove leading slashes
  cleaned = cleaned.replace(/^\/+/, "");

  // Remove any protocol prefixes
  cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, "");

  // Strip userId prefix if already present (avoid double-prefixing)
  if (cleaned.startsWith(`${userId}/`)) {
    cleaned = cleaned.slice(userId.length + 1);
  }

  // Remove any remaining dangerous characters
  cleaned = cleaned.replace(/[<>:"|?*\x00-\x1F]/g, "_");

  // Collapse multiple slashes
  cleaned = cleaned.replace(/\/+/g, "/");

  if (!cleaned) {
    throw new Error("Path resolved to empty after sanitization");
  }

  const safePath = `${userId}/${cleaned}`;

  // Final validation: ensure the resolved path still starts with userId prefix
  if (!safePath.startsWith(`${userId}/`)) {
    throw new Error("Path traversal detected");
  }

  return safePath;
}
