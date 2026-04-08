import Image from "next/image";
import Link from "next/link";
import { Models } from "node-appwrite";

import ActionDropdown from "@/components/ActionDropdown";
import { Chart } from "@/components/Chart";

import { Separator } from "@/components/ui/separator";

import FormattedDateTime from "@/components/FormattedDateTime";
import Thumbnail from "@/components/Thumbnail";
import { getFiles, getTotalSpaceUsed } from "@/lib/actions/file.action";
import { convertFileSize, getUsageSummary } from "@/lib/utils";
import { Star } from "lucide-react";

type FileDoc = Models.Document & {
  url: string;
  type: string;
  extension: string;
  size: number;
  name: string;
  bucketFileId: string;
  starred?: boolean;
};

/**
 * CloudArchive dashboard (server component).
 *
 * Why server-rendered:
 * - Keeps Appwrite reads and access checks on the server.
 * - Enables fast initial render with data already hydrated (no client waterfall).
 *
 * **Sections**
 * - **Usage summary** — links to type routes (documents, images, media, others) with totals from `getTotalSpaceUsed`.
 * - **Recent files uploaded** — last 10 files from `getFiles`; **favorited** rows show the same amber `Star` as
 *   `SelectableFileGrid` when `file.starred` is true. Row actions use client `ActionDropdown`.
 *
 * Performance:
 * - Fetches recent files and usage totals in parallel to reduce TTFB.
 */
const Dashboard = async () => {
  // Parallel requests
  const [files, totalSpace] = await Promise.all([
    getFiles({ types: [], limit: 10 }),
    getTotalSpaceUsed(),
  ]);

  // Get usage summary
  const usageSummary = getUsageSummary(totalSpace);

  return (
    <div className="dashboard-container">
      <section>
        <Chart used={totalSpace.used} />

        {/* Uploaded file type summaries */}
        <ul className="dashboard-summary-list">
          {usageSummary.map((summary) => (
            <Link
              href={summary.url}
              key={summary.title}
              className="dashboard-summary-card"
            >
              <div className="space-y-4">
                <div className="flex justify-between gap-3">
                  <Image
                    src={summary.icon}
                    width={100}
                    height={100}
                    alt="uploaded image"
                    className="summary-type-icon"
                  />
                  <h4 className="summary-type-size">
                    {convertFileSize(summary.size) || 0}
                  </h4>
                </div>

                <h5 className="summary-type-title">{summary.title}</h5>
                <Separator className="bg-light-400" />
                <FormattedDateTime
                  date={summary.latestDate}
                  className="text-center"
                />
              </div>
            </Link>
          ))}
        </ul>
      </section>

      {/* Recent files uploaded */}
      <section className="dashboard-recent-files">
        <h2 className="h3 xl:h2 text-light-100">Recent files uploaded</h2>
        {files.documents.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-5">
            {files.documents.map((file: FileDoc) => (
              <Link
                href={file.url}
                target="_blank"
                className="flex items-center gap-3"
                key={file.$id}
              >
                <Thumbnail
                  type={file.type}
                  extension={file.extension}
                  url={file.url}
                />

                <div className="recent-file-details">
                  <div className="flex flex-col gap-1">
                    <div className="flex min-w-0 items-start gap-2">
                      {file.starred && (
                        <span
                          className="mt-0.5 inline-flex shrink-0"
                          title="Favorited"
                          aria-label="Favorited"
                        >
                          <Star
                            className="size-[18px] fill-amber-400 text-amber-400"
                            strokeWidth={0}
                            aria-hidden
                          />
                        </span>
                      )}
                      <p className="recent-file-name min-w-0 flex-1">{file.name}</p>
                    </div>
                    <FormattedDateTime
                      date={file.$createdAt}
                      className="caption"
                    />
                  </div>
                  <ActionDropdown file={file} />
                </div>
              </Link>
            ))}
          </ul>
        ) : (
          <p className="empty-list">No files uploaded</p>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
