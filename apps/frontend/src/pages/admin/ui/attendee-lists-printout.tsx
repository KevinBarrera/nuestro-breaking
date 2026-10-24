import { useId } from 'react';
import {
  cssString,
  folioLabel,
  formatGeneratedAt,
  formatSnapshotStamp,
  listKind,
  paperSheetTitle,
  printIndex,
  printMeta,
  type AttendeeListView,
  type PrintOptions,
} from './attendee-lists-model';
import { formatCheckInTime } from './admin-check-in-model';

type PrintoutProps = {
  eventName: string;
  generatedAt: string;
  lists: AttendeeListView[];
  options: PrintOptions;
};

const paperRows = 18;

const steps = [
  'Busca a la persona por nombre, AKA o folio. Las listas van en orden alfabético.',
  <>
    Si la columna <b>Entró</b> ya tiene hora, la persona entró antes de imprimir: no la dejes pasar
    otra vez sin revisar.
  </>,
  <>
    Marca la casilla cuando entre. Si no aparece, inscríbela en la hoja{' '}
    <b>Inscripciones en papel</b>.
  </>,
  'Cuando vuelva el sistema, registra en Check-in a cada persona que marcaste y captura las inscripciones en papel.',
];

// Paper header and footer live in the page margin boxes, so they repeat on every sheet and
// Chrome leaves out its own date, title and URL. `counter(pages)` gives "Hoja X de Y".
function pageRules(eventName: string, stamp: string) {
  const box = 'font: 9pt Archivo, ui-sans-serif, system-ui, sans-serif; color: #000;';
  return `@media print {
  @page {
    size: letter;
    margin: 16mm 12mm;
    @top-left { content: ${cssString(`LOS MÁS PESADOS · ${eventName}`)}; ${box} vertical-align: bottom; padding-bottom: 2mm; margin-bottom: 4mm; border-bottom: 1px solid #000; }
    @top-right { content: ${cssString(`Lista de respaldo · Datos al ${stamp}`)}; ${box} vertical-align: bottom; padding-bottom: 2mm; margin-bottom: 4mm; border-bottom: 1px solid #000; }
    @bottom-left { content: ${cssString(`Instantánea: no refleja cambios hechos después del ${stamp}. Sin datos de contacto.`)}; ${box} vertical-align: top; padding-top: 2mm; margin-top: 4mm; border-top: 1px solid #000; }
    @bottom-right { content: "Hoja " counter(page) " de " counter(pages); ${box} vertical-align: top; padding-top: 2mm; margin-top: 4mm; border-top: 1px solid #000; }
  }
}`;
}

const markBox = (
  <span
    aria-hidden="true"
    className="block size-[18px] rounded-[3px] border-[1.5px] border-black"
  />
);

const th =
  'border-b-2 border-black px-2 py-1 text-left text-[11px] leading-[14px] font-bold tracking-[0.06em] uppercase';
const td = 'border-b border-black px-2 py-[5px] align-top';

// Listas de respaldo printout (#363): only rendered for print, black on white, letter size.
export function AttendeeListsPrintout({ eventName, generatedAt, lists, options }: PrintoutProps) {
  const stamp = formatSnapshotStamp(generatedAt);
  return (
    <div className="hidden bg-white font-sans text-black [print-color-adjust:exact] print:block">
      <style>{pageRules(eventName, stamp)}</style>
      {options.cover && (
        <section aria-label="Portada" className="flex flex-col gap-5 break-after-page">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[36px] leading-10 font-extrabold tracking-[-0.02em]">
              Listas de respaldo
            </h1>
            <p className="text-base">
              {eventName} · Datos al {formatGeneratedAt(generatedAt)}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 rounded-lg border-[1.5px] border-black px-5 py-4">
            <h2 className="text-lg font-extrabold">Cómo usarlas si el sistema falla</h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[21px]">
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">Índice</h2>
            <table className="w-full border-collapse text-[15px] leading-5">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Lista
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Personas
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-[#f2f2f2]">
                {printIndex(lists, options.paper).map((entry) => (
                  <tr key={entry.label}>
                    <td className={td}>{entry.label}</td>
                    <td className={`${td} text-right font-mono`}>{entry.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
            {['Responsable de la mesa', 'Teléfono de coordinación'].map((label) => (
              <div key={label} className="flex flex-col gap-7">
                <span>{label}</span>
                <span className="border-b border-black" />
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="flex flex-col gap-4">
        {lists.map((list, index) => (
          <PrintedList key={list.id} list={list} newSheet={options.sheetPerList && index > 0} />
        ))}
      </div>
      {options.paper && <PaperSheet />}
    </div>
  );
}

function PrintedList({ list, newSheet }: { list: AttendeeListView; newSheet: boolean }) {
  const titleId = useId();
  const kind = list.group === 'event' ? null : listKind(list);
  return (
    <section
      aria-labelledby={titleId}
      className={`flex flex-col gap-1.5 break-inside-avoid ${newSheet ? 'break-before-page' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={titleId} className="text-xl leading-[26px] font-extrabold">
          {kind && <span className="font-semibold">{kind} · </span>}
          {list.title}
        </h2>
        <span className="text-sm whitespace-nowrap">{printMeta(list)}</span>
      </div>
      <table
        aria-labelledby={titleId}
        className="w-full table-fixed border-collapse text-[15px] leading-5"
      >
        <thead>
          <tr>
            <th scope="col" className={`${th} w-[30px]`}>
              <span className="sr-only">Marca</span>
              <span aria-hidden="true">✓</span>
            </th>
            <th scope="col" className={`${th} ${list.showPasses ? 'w-[23%]' : 'w-[40%]'}`}>
              Nombre
            </th>
            <th scope="col" className={th}>
              AKA
            </th>
            <th scope="col" className={`${th} w-[90px]`}>
              Folio
            </th>
            {list.showPasses && (
              <th scope="col" className={`${th} w-[38%]`}>
                Pases
              </th>
            )}
            <th scope="col" className={`${th} w-[60px]`}>
              Entró
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-[#f2f2f2]">
          {list.rows.map((row) => (
            <tr key={row.registrationId} className="break-inside-avoid">
              <td className={td}>{markBox}</td>
              <th scope="row" className={`${td} text-left font-bold break-words`}>
                {row.fullName}
                {row.pending && (
                  <span className="block text-xs font-semibold">Pendiente de pago</span>
                )}
              </th>
              <td className={`${td} break-words`}>{row.stageName ?? ''}</td>
              <td className={`${td} font-mono text-sm`}>{folioLabel(row.folio)}</td>
              {list.showPasses && (
                <td className={`${td} text-[13px] leading-[18px]`}>{row.passes.join(', ')}</td>
              )}
              <td className={`${td} font-mono text-sm font-medium`}>
                {row.checkedInAt ? formatCheckInTime(row.checkedInAt) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PaperSheet() {
  return (
    <section aria-label={paperSheetTitle} className="flex flex-col gap-4 break-before-page">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[22px] leading-7 font-extrabold">{paperSheetTitle}</h2>
        <p className="text-sm">
          Para quien se inscriba mientras no hay sistema. Cobra en efectivo, entrega el recibo y
          anótalo aquí. Al volver el sistema, captúralas en Nueva inscripción con el mismo número de
          recibo.
        </p>
      </div>
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr>
            {['#', 'Nombre completo', 'AKA', 'Pase y competencias', 'Monto', 'Recibo'].map(
              (label) => (
                <th key={label} scope="col" className={th}>
                  {label}
                </th>
              ),
            )}
            <th scope="col" className={`${th} w-[30px]`}>
              <span className="sr-only">Entró</span>
              <span aria-hidden="true">✓</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: paperRows }, (_, index) => (
            <tr key={index} className="h-[34px]">
              <td className={`${td} w-6 align-middle font-mono text-[13px]`}>{index + 1}</td>
              <td className={td} />
              <td className={`${td} w-[110px]`} />
              <td className={`${td} w-[150px]`} />
              <td className={`${td} w-[72px]`} />
              <td className={`${td} w-[72px]`} />
              <td className={`${td} align-middle`}>{markBox}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
