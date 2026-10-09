import { formatMxn } from '@/entities/event-catalog';
import type { PassOption } from '@/features/public-purchase';
import { useId } from 'react';

type PassCardProps = { option: PassOption; onToggle: () => void };

const cardTone = (option: PassOption) =>
  option.selected
    ? 'border-2 border-heading bg-surface p-[15px]'
    : option.disabled
      ? 'border border-dashed border-input-line bg-chip p-4 text-muted'
      : 'border border-line bg-surface p-4';

// A checkbox card for one pass. The checkbox is named by the pass; the hint and the price
// describe it. A pass unlocked by another one says so in the success tone.
export function PassCard({ option, onToggle }: PassCardProps) {
  const id = useId();
  const { pass, selected, disabled, hint } = option;
  const unlocked = !disabled && pass.requiresPassClass !== null;
  return (
    <label
      htmlFor={id}
      className={`flex min-h-11 items-center gap-3.5 rounded-2xl ${cardTone(option)} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus`}
    >
      <input
        id={id}
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${hint ? `${id}-hint ` : ''}${id}-price`}
        className="size-[22px] shrink-0 accent-primary outline-none"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong id={`${id}-name`} className={`text-[17px] ${disabled ? '' : 'text-heading'}`}>
          {pass.name}
        </strong>
        {hint ? (
          <span
            id={`${id}-hint`}
            className={`text-[13px] ${unlocked ? 'font-semibold text-success-fg' : 'text-muted'}`}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <span id={`${id}-price`} className="shrink-0 font-mono text-[15px]">
        {formatMxn(pass.priceCents)}
      </span>
    </label>
  );
}
