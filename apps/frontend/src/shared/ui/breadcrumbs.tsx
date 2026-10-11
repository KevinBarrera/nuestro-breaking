import { Link } from 'react-router';

export type BreadcrumbItem = { label: string; to?: string };

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  // `link`: pink underlined links, "/" separators and a muted current page (Equipo screens).
  variant?: 'default' | 'link';
};

// The separator is generated content, so it stays out of each item's text and name.
const separators = {
  default: "before:pr-1 before:text-muted before:content-['›']",
  link: "before:pr-1 before:text-muted before:content-['/']",
};
const linkClasses = {
  default: 'font-medium text-fg underline-offset-4 hover:underline',
  link: 'text-link underline underline-offset-4 hover:text-link-hover',
};
const currentClasses = {
  default: 'font-semibold text-heading',
  link: 'text-muted',
};

// "Ruta de navegación": an ordered trail whose last item is the current page. Earlier items
// are links with 44px targets; long labels wrap instead of widening the page.
export function Breadcrumbs({ items, variant = 'default' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li
              key={`${index}-${item.label}`}
              className={`flex min-w-0 items-center gap-x-1 ${index > 0 ? separators[variant] : ''}`}
            >
              {current || !item.to ? (
                <span
                  aria-current={current ? 'page' : undefined}
                  className={`min-w-0 py-2 break-words ${currentClasses[variant]}`}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className={`-mx-2 inline-flex min-h-11 items-center rounded-md px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${linkClasses[variant]}`}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
