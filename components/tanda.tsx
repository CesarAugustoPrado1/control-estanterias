import type { ReactNode } from "react";
import type { Cemento } from "@/lib/db/schema";
import { DIA_DE_LETRA, HORAS_SOSPECHOSAS, type Letra } from "@/lib/tarjetas";

/**
 * Como se ve una tanda en pantalla: igual que su tarjeta en el piso.
 *
 * El cuadrado de color con la letra es la tarjeta en miniatura. La idea es que
 * el operario reconozca la tanda en la lista con el mismo golpe de vista con que
 * la reconoce colgada de la estanteria.
 */

/** Texto oscuro sobre colores claros (amarillo), blanco sobre el resto. */
function textoSobre(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1f2937" : "#ffffff";
}

export function LetraDia({
  letra,
  tamano = "chico",
}: {
  letra: string | null;
  tamano?: "chico" | "grande";
}) {
  if (!letra || !(letra in DIA_DE_LETRA)) return null;
  const d = DIA_DE_LETRA[letra as Letra];
  const clase =
    tamano === "grande"
      ? "h-14 w-14 rounded-xl text-3xl"
      : "h-7 w-7 rounded-md text-sm";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center font-black ${clase}`}
      style={{ backgroundColor: d.hex, color: textoSobre(d.hex) }}
      title={`Tarjeta del ${d.dia}`}
    >
      {letra}
    </span>
  );
}

export function NombreTanda({
  palabra,
  letra,
  codigo,
  tamano = "chico",
}: {
  palabra: string | null;
  letra: string | null;
  codigo: string;
  tamano?: "chico" | "grande";
}) {
  if (!palabra) {
    // Sin tarjeta (tanda vieja, o no quedaba ninguna libre): se nombra por codigo.
    return (
      <span className={`cifra font-bold text-slate-900 ${tamano === "grande" ? "text-3xl" : ""}`}>
        {codigo}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <LetraDia letra={letra} tamano={tamano} />
      <span
        className={`truncate font-black tracking-wide text-slate-900 ${tamano === "grande" ? "text-4xl" : "text-base"}`}
      >
        {palabra.toUpperCase()}
      </span>
      {tamano === "chico" && (
        <span className="cifra shrink-0 text-xs font-normal text-slate-400">{codigo}</span>
      )}
    </span>
  );
}

/**
 * El cemento se muestra en grande solo cuando es blanco, que es el caso que hay
 * que ver: llenar una estanteria de blanco con mezcla gris arruina los moldes.
 * En pantalla se imita la marca del piso -laterales pintados de blanco-.
 */
export function ChipCemento({ cemento, grande = false }: { cemento: Cemento; grande?: boolean }) {
  if (cemento === "blanco") {
    return (
      <span
        className={`inline-flex items-center rounded-md border-2 border-slate-900 bg-white font-black uppercase tracking-wide text-slate-900 ${
          grande ? "px-3 py-1 text-lg" : "px-1.5 py-0.5 text-[11px]"
        }`}
      >
        Cemento blanco
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md bg-slate-200 font-semibold text-slate-700 ${
        grande ? "px-3 py-1 text-base" : "px-1.5 py-0.5 text-[11px]"
      }`}
    >
      cemento gris
    </span>
  );
}

export function Placa({ etiqueta, grande = false }: { etiqueta: string | null; grande?: boolean }) {
  if (!etiqueta) return null;
  return (
    <span
      className={`inline-flex items-center rounded border border-slate-400 bg-slate-100 font-mono font-bold text-slate-800 ${
        grande ? "px-3 py-1 text-xl" : "px-1.5 py-0.5 text-xs"
      }`}
    >
      {etiqueta}
    </span>
  );
}

/**
 * Una tanda que lleva en su estado mucho mas de lo razonable casi siempre tiene
 * un movimiento sin registrar. No es una alarma de demora: es "esto no cierra".
 */
export function esSospechosa(estado: string, desde: Date | string): boolean {
  const umbral = HORAS_SOSPECHOSAS[estado as keyof typeof HORAS_SOSPECHOSAS];
  if (!umbral) return false;
  const f = typeof desde === "string" ? new Date(desde) : desde;
  return (Date.now() - f.getTime()) / 3600000 > umbral;
}

export function MarcaSospechosa() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      ¿FALTA REGISTRAR?
    </span>
  );
}

/**
 * Texto que depende de la hora actual ("hace 2 min", "3 h adentro").
 *
 * En un componente de cliente, el servidor lo calcula en un instante y el
 * navegador lo vuelve a calcular al hidratar: si en el medio cambio el minuto,
 * React ve textos distintos y tira un error de hidratacion. La diferencia es
 * esperable y el valor del navegador es el correcto, asi que se le avisa a React
 * que no la trate como error.
 */
export function Relativo({ children }: { children: ReactNode }) {
  return <span suppressHydrationWarning>{children}</span>;
}
