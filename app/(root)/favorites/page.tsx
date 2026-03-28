import SelectableFileGrid from "@/components/SelectableFileGrid";
import { getStarredFiles } from "@/lib/actions/file.action";
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
 * Favorites (starred) view (server component).
 *
 * Why server-rendered:
 * - Star state is persisted as metadata and enforced server-side so the view is consistent across devices.
 * - Lists are derived from Appwrite queries rather than client filtering to keep payloads small at scale.
 */
const FavoritesPage = async () => {
  const files = await getStarredFiles({ types: [], sort: "$updatedAt-desc" });

  return (
    <div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">Favorites</h1>
      </section>

      {files && files.total > 0 ? (
        <SelectableFileGrid
          files={files.documents as PageFileDoc[]}
          variant="normal"
        />
      ) : (
        <p className="empty-list">No favorites yet</p>
      )}
    </div>
  );
};

export default FavoritesPage;

