import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

import { assertCanReadFile } from "@/lib/actions/file.action";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";

const MAX_BATCH = 100;

function uniqueZipEntryName(used: Set<string>, original: string): string {
  const name = original.replace(/[/\\]/g, "_").trim() || "file";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 1;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * **POST `/api/files/bulk-download`**
 *
 * Accepts JSON `{ fileIds: string[], variant?: "normal" | "trash" }`, builds one **ZIP** on the server
 * (JSZip + `storage.getFileDownload`), returns `application/zip`. Browsers block multiple simultaneous
 * `window.open` downloads; a single response avoids that.
 *
 * - Authorization: `assertCanReadFile` per id (see `lib/actions/file.action.ts`).
 * - **MAX_BATCH** files per request (see constant below).
 * - Duplicate display names inside the ZIP get ` (1)`, ` (2)`, … suffixes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileIds: unknown = body?.fileIds;
    const variant = body?.variant === "trash" ? "trash" : "normal";

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "No files selected" }, { status: 400 });
    }
    if (fileIds.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Select at most ${MAX_BATCH} files` },
        { status: 400 }
      );
    }

    const ids = fileIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (ids.length === 0) {
      return NextResponse.json({ error: "Invalid file ids" }, { status: 400 });
    }

    const { storage } = await createAdminClient();
    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const fileId of ids) {
      const doc = await assertCanReadFile(fileId, { variant });
      const bucketFileId = doc.bucketFileId as string;
      const entryName = uniqueZipEntryName(usedNames, String(doc.name ?? "file"));

      const buffer = await storage.getFileDownload({
        bucketId: appwriteConfig.bucketId,
        fileId: bucketFileId,
      });

      zip.file(entryName, buffer);
    }

    const nodeBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    return new NextResponse(new Uint8Array(nodeBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="cloudarchive-download.zip"',
      },
    });
  } catch (e) {
    console.error("bulk-download", e);
    return NextResponse.json(
      { error: "Download failed or not authorized" },
      { status: 403 }
    );
  }
}
