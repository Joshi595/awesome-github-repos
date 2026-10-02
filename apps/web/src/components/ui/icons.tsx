import type { ComponentChildren } from 'preact';

/** 16px stroke icons. Decorative by default: pair them with visible text or an aria-label. */
function Icon({ children, filled = false }: { children: ComponentChildren; filled?: boolean }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const StarIcon = () => (
  <Icon filled>
    <path d="M8 1.6l1.9 4 4.4.6-3.2 3 .8 4.3L8 11.4l-3.9 2.1.8-4.3-3.2-3 4.4-.6z" stroke="none" />
  </Icon>
);

export const ForkIcon = () => (
  <Icon>
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="12" cy="3.5" r="1.5" />
    <circle cx="8" cy="12.5" r="1.5" />
    <path d="M4 5v1.5c0 1 .8 1.8 1.8 1.8h4.4c1 0 1.8-.8 1.8-1.8V5M8 8.3V11" />
  </Icon>
);

export const BookmarkIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon filled={filled}>
    <path d="M4 2.5h8v11.5l-4-3-4 3z" />
  </Icon>
);

export const CompareIcon = () => (
  <Icon>
    <rect x="2" y="3" width="4.5" height="10" rx="1" />
    <rect x="9.5" y="3" width="4.5" height="10" rx="1" />
  </Icon>
);

export const ExternalIcon = () => (
  <Icon>
    <path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5L7.5 8.5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
);

export const FilterIcon = () => (
  <Icon>
    <path d="M2 4h12M4.5 8h7M6.5 12h3" />
  </Icon>
);

export const ListIcon = () => (
  <Icon>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Icon>
);

export const GridIcon = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.5 9h6l.5-9" />
  </Icon>
);
