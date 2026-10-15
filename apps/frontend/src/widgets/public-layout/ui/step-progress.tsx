type StepProgressProps = { step: number; total: number };

// "Paso N de 4" with one bar per step; the bars only repeat the text, so they are hidden.
export function StepProgress({ step, total }: StepProgressProps) {
  return (
    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
      <p className="font-mono text-xs tracking-[0.08em] text-muted uppercase">
        Paso {step} de {total}
      </p>
      <div aria-hidden="true" className="grid grid-cols-4 gap-1.5 lg:w-52">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={`h-1 rounded-sm ${index < step ? 'bg-link' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  );
}
