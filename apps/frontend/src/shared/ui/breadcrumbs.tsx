import { Link } from 'react-router';

export type BreadcrumbItem = { label: string; to?: string };

type BreadcrumbsProps = { items: BreadcrumbItem[] };

// The "›" separator is generated content, so it stays out of each item's text and name.
const separator = "before:pr-1 before:text-muted before:content-['›']";

// "Ruta de navegación": an ordered trail whose last item is the current page. Earlier items
// are links with 44px targets; long labels wrap instead of widening the page.
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li
              key={`${index}-${item.label}`}
              className={`flex min-w-0 items-center gap-x-1 ${index > 0 ? separator : ''}`}
            >
              {current || !item.to ? (
                <span
                  aria-current={current ? 'page' : undefined}
                  className="min-w-0 py-2 font-semibold break-words text-heading"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
