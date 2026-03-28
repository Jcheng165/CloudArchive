import { Client, Databases, Query, Storage } from "node-appwrite";

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * CloudArchive scheduled retention job: purge trash older than 30 days.
 *
 * Why this exists:
 * - **Compliance & cost control**: trash is a temporary safety net, not indefinite storage.
 * - **Data integrity**: we delete the Database document and its paired Storage object to avoid
 *   orphaned blobs or dangling metadata.
 *
 * Operational considerations:
 * - Uses Node-Appwrite with an API key because this is an administrative, cross-user batch job.
 * - Caps work per run (`Query.limit(100)`) to keep execution time predictable and avoid timeouts.
 * - Logs per-document failures and continues, which is essential for long-running background cleanup.
 */
export default async ({ res, log, error }) => {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_ENDPOINT;
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const filesCollectionId = process.env.APPWRITE_FILES_COLLECTION_ID;
    const bucketId = process.env.APPWRITE_BUCKET_ID;

    if (
      !endpoint ||
      !projectId ||
      !apiKey ||
      !databaseId ||
      !filesCollectionId ||
      !bucketId
    ) {
      throw new Error("Missing required environment variables");
    }

    const cutoffIso = new Date(Date.now() - DAYS_30_MS).toISOString();

    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);
    const storage = new Storage(client);

    const list = await databases.listDocuments(databaseId, filesCollectionId, [
      Query.equal("isDeleted", [true]),
      Query.lessThan("deletedAt", cutoffIso),
      Query.limit(100),
    ]);

    log(`Found ${list.total} trash items older than 30 days`);

    for (const doc of list.documents) {
      try {
        await databases.deleteDocument(databaseId, filesCollectionId, doc.$id);
        if (doc.bucketFileId) {
          await storage.deleteFile(bucketId, doc.bucketFileId);
        }
        log(`Deleted ${doc.$id}`);
      } catch (e) {
        error(`Failed deleting ${doc.$id}: ${String(e)}`);
      }
    }

    return res.send("OK");
  } catch (e) {
    error(String(e));
    return res.send("ERROR");
  }
};

