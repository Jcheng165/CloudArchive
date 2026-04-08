import SelectableFileGrid from "@/components/SelectableFileGrid";
import Sort from "@/components/Sort";
import { getFiles } from "@/lib/actions/file.action";
import { convertFileSize, getFileTypesParams } from "@/lib/utils";
import type { Models } from "node-appwrite";

type PageFileDoc = Models.Document & {
  url: string;
  type: string;
  extension: string;
  size: number;
  name: string;
  bucketFileId: string;
  owner?: {
    fullName?: string;
  };
};

/**
 * Type-scoped listing page (server component).
 *
 * Why server component:
 * - Listing uses a Server Action-backed query layer that enforces ownership + sharing rules.
 * - Keeps Appwrite credentials and query composition off the client.
 *
 * UX:
 * - `searchParams` drive server-side filtering/sorting so URLs are shareable and render is deterministic.
 * - Total size is computed from returned documents for transparent storage usage by category.
 */
const page = async ({ searchParams, params }: SearchParamProps) => {
  const type = ((await params)?.type as string) || "";
  const searchText = ((await searchParams)?.query as string) || ``;
  const sort = ((await searchParams)?.sort as string) || ``;

  const types = getFileTypesParams(type) as FileType[];

  const files = await getFiles({ types: types, searchText, sort });
  const totalBytes = files.documents.reduce(
    (sum: number, file: any) => sum + (Number(file.size) || 0),
    0
  );

  return (
    <div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">{type}</h1>

        <div className="total-size-section">
          <p className="body-1">
            Total: <span>{convertFileSize(totalBytes)}</span>
          </p>
          <div className="sort-container">
            <p className="body-1 hidden text-light-200 sm:block">Sort by:</p>
            <Sort />
          </div>
        </div>
      </section>

      {files.total > 0 ? (
        <SelectableFileGrid
          files={files.documents as PageFileDoc[]}
          variant="normal"
        />
      ) : (
        <p className="empty-list">No files uploaded</p>
      )}
    </div>
  );
};

export default page;
