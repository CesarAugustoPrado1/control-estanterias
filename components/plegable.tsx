import Link from "next/link";
import type { ReactNode } from "react";
import {
  atajosComunes,
  hoy,
  mismoPeriodo,
  nombrePeriodo,
  sumarDias,
  urlPeriodo,
  type Periodo,
} from "@/lib/periodo";
import { Boton, Campo, Entrada } from "@/components/ui";

/**
 * Bloques que se pliegan con un toque en el titulo, y el selector de periodo
 * que comparten Produccion y Estadisticas.
 *
 * `<details>` nativo: anda sin JavaScript y el navegador recuerda si quedo
 * abierto mientras se navega entre periodos. Plegado muestra un resumen, para
 * que varias secciones entren de un vistazo en la pantalla del celular.
 */

export const PLEGABLE = "group rounded-xl bg-slate-50 shadow-sm ring-1 ring-slate-200";
export const RESUMEN =
  "flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl bg-white px-4 py-2 select-none group-open:rounded-b-none [&::-webkit-details-marker]:hidden";
const FLECHA =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";

/** ▾ que gira al abrir. */
export function Flechita() {
  return (
    <span
      aria-hidden
      className="shrink-0 text-xl leading-none text-slate-400 transition-transform group-open:rotate-180"
    >
      ▾
    </span>
  );
}

export function Plegable({
  titulo,
  insignia,
  resumen,
  ayuda,
  abierto = true,
  children,
}: {
  titulo: string;
  /** Al lado del titulo: se ve tambien plegado. */
  insignia?: ReactNode;
  resumen: ReactNode;
  ayuda?: ReactNode;
  abierto?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={abierto} className={`${PLEGABLE} mb-3`}>
      <summary className={RESUMEN}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-900">{titulo}</span>
            {insignia}
          </div>
          <div className="cifra text-sm text-slate-600">{resumen}</div>
        </div>
        <Flechita />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3">
        {ayuda && <p className="text-sm text-slate-600">{ayuda}</p>}
        {children}
      </div>
    </details>
  );
}

export type AtajoExtra = { texto: string; url: string; activo: boolean };

/**
 * Elegir un dia o un rango. Plegado es una barra con el periodo y, si es un
 * solo dia, las flechas de dia anterior / siguiente, que andan sin desplegarlo.
 *
 * `eligiendo`: abierto al entrar a la pantalla; se pliega solo al elegir. La
 * clave por periodo vuelve a montar el bloque en cada cambio, y asi tambien los
 * campos de fecha muestran siempre el periodo actual.
 */
export function SelectorPeriodo({
  ruta,
  periodo,
  eligiendo,
  extras = [],
  nota,
}: {
  ruta: string;
  periodo: Periodo;
  eligiendo: boolean;
  /** Atajos propios de la pantalla, antes de los comunes. */
  extras?: AtajoExtra[];
  /** Al lado del periodo, plegado: "último día con producción". */
  nota?: string;
}) {
  const h = hoy();
  const { desde, hasta } = periodo;
  const unDia = desde === hasta;
  const algunExtra = extras.some((e) => e.activo);
  const atajos: AtajoExtra[] = [
    ...extras,
    ...atajosComunes(h).map((a) => ({
      texto: a.texto,
      url: urlPeriodo(ruta, a.periodo),
      activo: !algunExtra && mismoPeriodo(a.periodo, periodo),
    })),
  ];
  const dia = (n: number) => urlPeriodo(ruta, { desde: sumarDias(desde, n), hasta: sumarDias(desde, n) });

  return (
    <details key={`${desde}-${hasta}`} open={eligiendo} className={`${PLEGABLE} mb-3`}>
      <summary className={RESUMEN}>
        {unDia && (
          <Link href={dia(-1)} aria-label="Día anterior" className={FLECHA}>
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</div>
          <div className="truncate font-semibold text-slate-900">{nombrePeriodo(periodo)}</div>
          {nota && <div className="truncate text-xs text-slate-500">{nota}</div>}
        </div>
        {unDia && desde < h && (
          <Link href={dia(1)} aria-label="Día siguiente" className={FLECHA}>
            ›
          </Link>
        )}
        <Flechita />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Link
              key={a.texto}
              href={a.url}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${
                a.activo
                  ? "bg-blue-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {a.texto}
            </Link>
          ))}
        </div>
        <form action={ruta} className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <Campo etiqueta="Desde">
            <Entrada type="date" name="desde" defaultValue={desde} max={h} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="date" name="hasta" defaultValue={hasta} max={h} />
          </Campo>
          <Boton type="submit" className="col-span-2 sm:col-span-1">
            Ver
          </Boton>
        </form>
      </div>
    </details>
  );
}
