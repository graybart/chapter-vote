import { setContestCollapsed } from "@/lib/actions";

/**
 * Chevron to the left of a contest title, folding the row down to a
 * ribbon. Disabled while voting is open so the live contest can't be
 * hidden behind a one-line summary mid-vote.
 */
export function CollapseToggle({
  contestId,
  collapsed,
  canToggle,
  title,
}: {
  contestId: string;
  collapsed: boolean;
  canToggle: boolean;
  title: string;
}) {
  const label = collapsed ? `Expand ${title}` : `Collapse ${title}`;

  return (
    <form action={setContestCollapsed.bind(null, contestId, !collapsed)}>
      <button
        type="submit"
        disabled={!canToggle}
        aria-label={label}
        aria-expanded={!collapsed}
        title={
          canToggle
            ? label
            : "Voting is open — close or pause the contest before collapsing it."
        }
        className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          aria-hidden
          className={`transition-transform duration-150 ${
            collapsed ? "-rotate-90" : ""
          }`}
        >
          <path
            d="M1 1.5 6 6.5 11 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
