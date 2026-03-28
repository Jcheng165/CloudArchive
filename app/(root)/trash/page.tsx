import SelectableFileGrid from "@/components/SelectableFileGrid";
import { getDeletedFiles } from "@/lib/actions/file.action";
import type { Models } from "node-appwrite";

export const dynamic = "force-dynamic";

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
 * Trash view (server component).
 *
 * Security/tenancy:
 * - Trash is scoped to the owner in the query layer to avoid leaking deletion metadata through shares.
 *
 * UX:
 * - Uses the same grid component as normal listings but switches behavior via `variant="trash"`,
 *   enabling restore/permanent delete affordances and retention countdown labels.
 */
const TrashPage = async () => {
  const files = await getDeletedFiles({ sort: "$updatedAt-desc" });

  return (
    <div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">Trash</h1>
      </section>

      {files && files.total > 0 ? (
        <SelectableFileGrid
          files={files.documents as PageFileDoc[]}
          variant="trash"
        />
      ) : (
        <p className="empty-list">Trash is empty</p>
      )}
    </div>
  );
};

export default TrashPage;

