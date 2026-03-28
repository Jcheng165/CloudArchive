/**
 * Centralized Appwrite infrastructure configuration for CloudArchive.
 *
 * Why this pattern:
 * - **Single source of truth** for IDs (project/database/collection/bucket) to avoid
 *   "works locally but not in prod" drift.
 * - **Explicit trust boundaries**: `NEXT_PUBLIC_*` values are safe to expose to the browser
 *   (endpoint + IDs), while `NEXT_APPWRITE_KEY` is **server-only** and must never ship client-side.
 *
 * Security note:
 * - CloudArchive uses Node-Appwrite with an API key for administrative workflows inside Server Actions
 *   and Appwrite Functions. The browser never receives the secret key.
 */
export const appwriteConfig = {
  endpointUrl: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT!,
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE!,
  usersCollectionId: process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION!,
  filesCollectionId: process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION!,
  bucketId: process.env.NEXT_PUBLIC_APPWRITE_BUCKET!,
  secretKey: process.env.NEXT_APPWRITE_KEY!,
} as const;
