"use server";
import { revalidatePath } from "next/cache";
import type { Models } from "node-appwrite";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";
import { getCurrentUser } from "./user.actions";

/**
 * File lifecycle + sharing actions for CloudArchive.
 *
 * Why Server Actions:
 * - **Security**: we keep Appwrite API keys and privileged operations on the server.
 * - **Data integrity**: workflows coordinate Appwrite Storage (bytes) with Database documents (metadata).
 * - **Performance/UX**: actions can `revalidatePath` to refresh server-rendered lists without
 *   forcing clients to manually refetch or maintain complex cache state.
 *
 * Data model (high level):
 * - **Storage** holds the file bytes (identified by `bucketFileId`).
 * - **Database** holds metadata + relationships (identified by `$id`), including:
 *   ownership (`owner`), share access (`users` email array), lifecycle (`isDeleted`, `deletedAt`),
 *   and **`starred`** for the Favorites view.
 *
 * Authorization model:
 * - Most write operations use an admin API key (Node-Appwrite) for convenience and performance.
 * - **Every mutation is explicitly authorized server-side** (owner checks) before updating documents.
 * - Uploads derive the owner from the current session (`getCurrentUser`) and do not trust client-provided IDs.
 * - **Read access for ZIP bulk download** uses `assertCanReadFile` (owner **or** shared email; trash is owner-only).
 * - **Star / favorite** updates (`toggleStarred`, `bulkUpdateStarred`) require owner access and revalidate `/favorites`.
 */
const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

const getOwnerIdFromFileDoc = (file: any) =>
  typeof file?.owner === "string" ? file.owner : file?.owner?.$id;

const assertOwnerAccess = async (
  databases: Awaited<ReturnType<typeof createAdminClient>>["databases"],
  fileId: string
) => {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("User is not authenticated.");

  const doc: any = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId
  );

  const ownerId = getOwnerIdFromFileDoc(doc);
  if (!ownerId || ownerId !== currentUser.$id) {
    throw new Error("Not authorized to modify this file.");
  }

  return { currentUser, doc };
};

/**
 * Authorizes **read** access for server-side ZIP assembly (`/api/files/bulk-download`).
 *
 * - **Normal** (`variant` default): owner **or** current user’s email appears in the file’s `users` array;
 *   soft-deleted files are rejected.
 * - **Trash** (`variant: "trash"`): only the **owner** may download; file must have `isDeleted === true`.
 *
 * @param fileId — Files collection document id (`$id`).
 * @param options.variant — `"normal"` (default) vs `"trash"` list semantics.
 * @returns The file document (includes `bucketFileId`, `name`).
 */
export const assertCanReadFile = async (
  fileId: string,
  options?: { variant?: "normal" | "trash" }
) => {
  const { databases } = await createAdminClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("User is not authenticated.");

  const doc: any = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId
  );

  const ownerId = getOwnerIdFromFileDoc(doc);
  const isTrashed = doc.isDeleted === true;
  const variant = options?.variant ?? "normal";

  if (variant === "trash") {
    if (!isTrashed) throw new Error("Not in trash.");
    if (!ownerId || ownerId !== currentUser.$id) {
      throw new Error("Not authorized to access this file.");
    }
    return doc;
  }

  if (isTrashed) {
    throw new Error("File is in trash.");
  }

  if (ownerId === currentUser.$id) return doc;

  const email = String((currentUser as any).email ?? "").toLowerCase();
  const users: string[] = Array.isArray(doc?.users) ? doc.users : [];
  if (email && users.some((u: string) => String(u).toLowerCase() === email)) {
    return doc;
  }

  throw new Error("Not authorized to access this file.");
};

/**
 * Uploads bytes to Appwrite Storage and then creates the corresponding metadata document.
 *
 * Engineering decisions:
 * - **Two-phase write with compensation**: Storage upload happens first; if DB document creation fails,
 *   we delete the Storage object to prevent orphaned blobs and unexpected storage cost.
 * - **Versioning**: we compute `version` per-owner + filename to support "enterprise" workflows where
 *   the same logical document is updated over time while retaining historical versions.
 *
 * Security posture:
 * - Uses the admin client because Storage writes often require elevated privileges.
 * - Derives `ownerId` from the current user session; client-provided identity is ignored.
 * - Ownership and sharing semantics are encoded in the metadata doc and enforced on reads/updates.
 */
export const uploadFile = async ({
  file,
  ownerId,
  accountId,
  path,
}: UploadFileProps) => {
  const { storage, databases } = await createAdminClient();
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User is not authenticated.");

    // Do not trust client-provided identity.
    ownerId = currentUser.$id;
    accountId = (currentUser as any).accountId ?? accountId;

    const inputFile = InputFile.fromBuffer(file, file.name);

    const bucketFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      inputFile
    );

    // Determine version based on existing files with the same name for this owner
    const existing = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [
        Query.equal("owner", [ownerId]),
        Query.equal("name", file.name),
      ]
    );

    const latestVersion =
      existing.total > 0
        ? Math.max(
            ...existing.documents.map((doc: any) =>
              typeof doc.version === "number" ? doc.version : 1
            )
          )
        : 0;

    const nextVersion = latestVersion + 1;

    // so we know the meta data
    const fileDocument = {
      type: getFileType(bucketFile.name).type,
      name: file.name,
      url: constructFileUrl(bucketFile.$id),
      extension: getFileType(bucketFile.name).extension,
      size: bucketFile.sizeOriginal,
      owner: ownerId,
      accountId,
      users: [],
      bucketFileId: bucketFile.$id,
      version: nextVersion,
      originalName: file.name,
      starred: false,
      isDeleted: false,
      deletedAt: null,
    };

    const newFile = await databases
      .createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        ID.unique(),
        fileDocument
      )
      .catch(async (error: unknown) => {
        await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
        handleError(error, "Failed to create file document");
      });

    revalidatePath(path);
    return parseStringify(newFile);
  } catch (error) {
    handleError(error, "Failed to upload file");
  }
};

/**
 * Builds Appwrite Queries for listing files in CloudArchive.
 *
 * Why query composition matters:
 * - **Multi-user sharing**: access is granted either by ownership or by presence in a `users` email array.
 *   We model this as a single `Query.or([...])` so Appwrite can filter server-side (faster + safer).
 * - **Soft delete**: default lists exclude trashed documents, while keeping backwards compatibility for
 *   older docs that may not have `isDeleted` yet.
 * - **Efficiency**: optional `limit`, server-side search on `name`, and ordering keep responses small,
 *   which improves TTFB and list rendering time.
 */
const createQueries = (
  currentUser: Models.Document & { email?: string },
  types: string[],
  searchText: string,
  sort: string,
  limit?: number
) => {
  const queries = [
    Query.or([
      Query.equal("owner", [currentUser.$id]),
      ...(currentUser.email ? [Query.contains("users", [currentUser.email])] : []),
    ]),
    // Exclude soft-deleted files from normal queries.
    // Using notEqual(true) also keeps older documents (without isDeleted) visible.
    Query.notEqual("isDeleted", [true]),
  ];

  if (types.length > 0) queries.push(Query.equal("type", types));
  if (searchText) queries.push(Query.contains("name", searchText));
  if (limit) queries.push(Query.limit(limit));

  if (sort) {
    const [sortBy, orderBy] = sort.split("-");

    queries.push(
      orderBy === "asc" ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy)
    );
  }

  return queries;
};

/**
 * Lists accessible (non-trashed) files for the current user.
 *
 * Why we sometimes "expand" owner:
 * - Appwrite relationships can be returned as either an ID or an expanded document depending on
 *   collection configuration; the UI wants `owner.fullName` for auditability and collaboration UX.
 * - We enrich documents server-side to keep client components simple and to avoid N+1 fetches in the browser.
 */
export const getFiles = async ({
  types = [],
  searchText = ``,
  sort = `$createdAt-desc`,
  limit,
}: GetFilesProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error("User not found");

    const queries = createQueries(currentUser, types, searchText, sort, limit);

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries
    );

    // Appwrite relationships may come back as an ID string instead of
    // an expanded document depending on your setup/version.
    // The tutorial expects `file.owner.fullName`, so we expand it here.
    const documentsWithOwner = await Promise.all(
      files.documents.map(async (file) => {
        const ownerId =
          typeof (file as any).owner === "string"
            ? (file as any).owner
            : (file as any).owner?.$id;

        if (!ownerId) return file;

        try {
          const ownerDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            ownerId
          );

          return {
            ...file,
            owner: ownerDoc,
          };
        } catch {
          return file;
        }
      })
    );

    return parseStringify({ ...files, documents: documentsWithOwner });
  } catch (error) {
    handleError(error, "Failed to get Files");
  }
};

/**
 * Lists trashed documents for the current user.
 *
 * Why this is owner-only:
 * - Shared access typically should not grant the ability to view or restore another user's trash.
 *   Keeping trash scoped to `owner` matches enterprise expectations and reduces accidental disclosure.
 */
export const getDeletedFiles = async ({
  searchText = ``,
  sort = `$createdAt-desc`,
  limit,
}: {
  searchText?: string;
  sort?: string;
  limit?: number;
}) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error("User not found");

    const queries = [
      Query.equal("owner", [currentUser.$id]),
      Query.equal("isDeleted", [true]),
    ];

    if (searchText) queries.push(Query.contains("name", searchText));
    if (limit) queries.push(Query.limit(limit));

    if (sort) {
      const [sortBy, orderBy] = sort.split("-");

      queries.push(
        orderBy === "asc" ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy)
      );
    }

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries
    );

    const documentsWithOwner = await Promise.all(
      files.documents.map(async (file) => {
        const ownerId =
          typeof (file as any).owner === "string"
            ? (file as any).owner
            : (file as any).owner?.$id;

        if (!ownerId) return file;

        try {
          const ownerDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            ownerId
          );

          return {
            ...file,
            owner: ownerDoc,
          };
        } catch {
          return file;
        }
      })
    );

    return parseStringify({ ...files, documents: documentsWithOwner });
  } catch (error) {
    handleError(error, "Failed to get deleted files");
  }
};

export const getStarredFiles = async ({
  types = [],
  searchText = ``,
  sort = `$createdAt-desc`,
  limit,
}: GetFilesProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not found");

    const queries = createQueries(currentUser, types, searchText, sort, limit);
    queries.push(Query.equal("starred", [true]));

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries
    );

    const documentsWithOwner = await Promise.all(
      files.documents.map(async (file) => {
        const ownerId =
          typeof (file as any).owner === "string"
            ? (file as any).owner
            : (file as any).owner?.$id;

        if (!ownerId) return file;

        try {
          const ownerDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            ownerId
          );

          return {
            ...file,
            owner: ownerDoc,
          };
        } catch {
          return file;
        }
      })
    );

    return parseStringify({ ...files, documents: documentsWithOwner });
  } catch (error) {
    handleError(error, "Failed to get starred files");
  }
};

/**
 * Toggles **starred** for a single file (per-file menu). Owner-only.
 * Revalidates `path` and **`/favorites`** so lists stay in sync.
 */
export const toggleStarred = async ({
  fileId,
  starred,
  path,
}: {
  fileId: string;
  starred: boolean;
  path: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        starred,
      }
    );

    revalidatePath(path);
    revalidatePath("/favorites");
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to toggle starred");
  }
};

/**
 * Sets **`starred`** for many files at once (bulk action bar: Favorite / Unfavorite).
 * Owner-only per file. Revalidates `path` and **`/favorites`**.
 */
export const bulkUpdateStarred = async ({
  fileIds,
  starred,
  path,
}: {
  fileIds: string[];
  starred: boolean;
  path: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await Promise.all(fileIds.map((id) => assertOwnerAccess(databases, id)));
    await Promise.all(
      fileIds.map((fileId) =>
        databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId,
          { starred }
        )
      )
    );

    revalidatePath(path);
    revalidatePath("/favorites");
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to bulk update favorites");
  }
};

export const bulkSoftDelete = async ({
  fileIds,
  path,
}: {
  fileIds: string[];
  path: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await Promise.all(fileIds.map((id) => assertOwnerAccess(databases, id)));
    await Promise.all(
      fileIds.map((fileId) =>
        databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId,
          {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
          }
        )
      )
    );

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to bulk soft delete");
  }
};

export const bulkRestore = async ({
  fileIds,
  path,
}: {
  fileIds: string[];
  path: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await Promise.all(fileIds.map((id) => assertOwnerAccess(databases, id)));
    await Promise.all(
      fileIds.map((fileId) =>
        databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId,
          {
            isDeleted: false,
            deletedAt: null,
          }
        )
      )
    );

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to bulk restore");
  }
};

export const bulkDeletePermanently = async ({
  files,
  path,
}: {
  files: { fileId: string; bucketFileId: string }[];
  path: string;
}) => {
  const { databases, storage } = await createAdminClient();

  try {
    await Promise.all(files.map(({ fileId }) => assertOwnerAccess(databases, fileId)));
    await Promise.all(
      files.map(async ({ fileId, bucketFileId }) => {
        await databases.deleteDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId
        );
        await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
      })
    );

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to bulk permanently delete");
  }
};

export const renameFile = async ({
  fileId,
  name,
  extension,
  path,
}: RenameFileProps) => {
  const { databases } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    const newName = `${name}.${extension}`;
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        name: newName,
      }
    );
    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,

  path,
}: UpdateFileUsersProps) => {
  const { databases } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        users: emails,
      }
    );
    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

/**
 * Bulk share: updates the email-based access array (`users`) for multiple files.
 *
 * Why a dedicated bulk action:
 * - **Enterprise UX**: teams often grant the same access to many files at once.
 * - **Consistency**: we update server-side so authorization and validation remain centralized.
 *
 * Behavior:
 * - Normalizes emails (trim/lowercase) and de-duplicates.
 * - Merges with existing `users` values per document to avoid accidentally removing access.
 */
export const bulkUpdateFileUsers = async ({
  fileIds,
  emails,
  path,
}: BulkUpdateFileUsersProps) => {
  const { databases } = await createAdminClient();

  const normalized = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  try {
    await Promise.all(
      fileIds.map(async (fileId) => {
        await assertOwnerAccess(databases, fileId);
        const doc: any = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId
        );

        const existing: string[] = Array.isArray(doc?.users) ? doc.users : [];
        const merged = Array.from(new Set([...existing, ...normalized]));

        return databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          fileId,
          { users: merged }
        );
      })
    );

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to bulk update file users");
  }
};

export const deleteFile = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  const { databases } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    // Soft delete: mark document as deleted, keep storage file
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      }
    );

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to soft delete file");
  }
};

export const restoreFile = async ({
  fileId,
  path,
}: {
  fileId: string;
  path: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    const restoredFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        isDeleted: false,
        deletedAt: null,
      }
    );

    revalidatePath(path);
    return parseStringify(restoredFile);
  } catch (error) {
    handleError(error, "Failed to restore file");
  }
};

export const deleteFilePermanently = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  const { databases, storage } = await createAdminClient();

  try {
    await assertOwnerAccess(databases, fileId);
    const deletedFile = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId
    );

    if (deletedFile) {
      await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
    }

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to permanently delete file");
  }
};


export async function getTotalSpaceUsed() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User is not authenticated.");

    const { databases } = await createAdminClient();
    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [Query.equal("owner", [currentUser.$id])],
    );

    const totalSpace = {
      image: { size: 0, latestDate: "" },
      document: { size: 0, latestDate: "" },
      video: { size: 0, latestDate: "" },
      audio: { size: 0, latestDate: "" },
      other: { size: 0, latestDate: "" },
      used: 0,
      all: 2 * 1024 * 1024 * 1024 /* 2GB available bucket storage */,
    };

    files.documents.forEach((file) => {
      const fileType = file.type as FileType;
      totalSpace[fileType].size += file.size;
      totalSpace.used += file.size;

      if (
        !totalSpace[fileType].latestDate ||
        new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)
      ) {
        totalSpace[fileType].latestDate = file.$updatedAt;
      }
    });

    return parseStringify(totalSpace);
  } catch (error) {
    handleError(error, "Error calculating total space used:, ");
  }
}