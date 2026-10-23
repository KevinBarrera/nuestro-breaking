import type { ReactNode, Ref } from 'react';

type SettingsSectionProps = {
  headingId: string;
  title: ReactNode;
  description: string;
  // Sections move focus to their heading after some writes.
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
};

// One block of Datos del evento (#323): the title and what it holds on the left, its card on the
// right; stacked when the width runs out.
export function SettingsSection({
  headingId,
  title,
  description,
  headingRef,
  children,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-wrap gap-x-12 gap-y-4 border-t border-line py-8"
    >
      <div className="flex max-w-[300px] flex-[1_1_220px] flex-col gap-1">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={headingRef ? -1 : undefined}
          className="flex items-center gap-2 text-lg font-bold text-heading outline-none"
        >
          {title}
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="min-w-0 flex-[999_1_440px]">{children}</div>
    </section>
  );
}

// The white card that holds a section's content.
export const settingsCard = 'rounded-xl border border-line bg-surface';
