import clsx from "clsx";
import Link from "next/link";

/** Previous / next links between pages of a list ("Page 2 of 9"). Renders nothing for a single page. Props only. */
export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Href for a 1-based page number. */
  hrefFor: (page: number) => string;
  className?: string;
}

export function Pagination({ page, pageCount, hrefFor, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className={clsx("pagination", className)}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className="btn btn-outline">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="pagination__status num">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className="btn btn-outline">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
