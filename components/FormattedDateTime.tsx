import { cn, formatDateTime } from "@/lib/utils";

/**
 * Consistent timestamp rendering for CloudArchive.
 *
 * Why this wrapper exists:
 * - Centralizes date formatting so list rows, cards, and search results display the same
 *   human-friendly format (important for auditability in storage systems).
 * - Keeps formatting logic in `lib/utils.ts`, making future localization/timezone support easier.
 */
const FormattedDateTime = ({
  date,
  className,
}: {
  date: string;
  className?: string;
}) => {
  return (
    <p className={cn(`body-1 text-light-200`, className)}>
      {formatDateTime(date)}
    </p>
  );
};

export default FormattedDateTime;
