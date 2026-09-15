import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/estados";
import type { Estado } from "@/lib/db/schema";

/* -------------------------------------------------------------------------- */
/* Contenedores                                                               */
/* -------------------------------------------------------------------------- */

export function Pantalla({
  titulo,
  bajada,
  acciones,
  children,
}: {
  titulo: string;
  bajada?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-4 sm:px-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {titulo}
          </h1>
          {bajada && <p className="mt-1 text-sm text-slate-600">{bajada}</p>}
        </div>
        {acciones}
      </header>
      {children}
    </div>
  );
}

export function Tarjeta({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </div>
  );
}

export function Seccion({
  titulo,
  cantidad,
  ayuda,
  acciones,
  children,
}: {
  titulo: string;
  cantidad?: number;
  ayuda?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {titulo}
          {cantidad !== undefined && (
            <span className="cifra ml-2 text-slate-500">{cantidad}</span>
          )}
        </h2>
        {acciones}
      </div>
      {ayuda && <p className="mb-2 text-sm text-slate-600">{ayuda}</p>}
      {children}
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Controles                                                                  */
/* -------------------------------------------------------------------------- */

type BotonProps = ComponentProps<"button"> & {
  tono?: "primario" | "neutro" | "peligro" | "fantasma";
  ancho?: boolean;
};

const TONOS: Record<NonNullable<BotonProps["tono"]>, string> = {
  primario:
    "bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900 disabled:bg-blue-300",
  neutro:
    "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400",
  peligro:
    "bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-red-300",
  fantasma: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
};

/** 48 px de alto minimo: es lo que se puede tocar con guantes. */
export function Boton({
  tono = "primario",
  ancho,
  className = "",
  ...props
}: BotonProps) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed ${TONOS[tono]} ${ancho ? "w-full" : ""} ${className}`}
    />
  );
}

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {etiqueta}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export const claseInput =
  "w-full min-h-12 rounded-lg border-0 bg-white px-3 text-base text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none";

export function Entrada(props: ComponentProps<"input">) {
  return <input {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Selector(props: ComponentProps<"select">) {
  return <select {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Aviso({
  tono = "info",
  children,
}: {
  tono?: "info" | "error" | "ok" | "atencion";
  children: ReactNode;
}) {
  const tonos = {
    info: "bg-slate-100 text-slate-800 ring-slate-200",
    error: "bg-red-50 text-red-900 ring-red-200",
    ok: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    atencion: "bg-amber-50 text-amber-900 ring-amber-200",
  };
  return (
    <div className={`rounded-lg px-3 py-2 text-sm ring-1 ${tonos[tono]}`} role={tono === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Piezas del dominio                                                         */
/* -------------------------------------------------------------------------- */

export function ChipEstado({ estado }: { estado: Estado }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.punto}`} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export function MarcaRehornear() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
      REHORNEAR
    </span>
  );
}

/**
 * Un contador que es una puerta, no un numero muerto: se toca y lleva a la
 * lista de lo que lo compone.
 */
export function Contador({
  href,
  titulo,
  valor,
  pie,
  estado,
}: {
  href: string;
  titulo: string;
  valor: ReactNode;
  pie?: ReactNode;
  estado?: Estado;
}) {
  const c = estado ? COLOR_ESTADO[estado] : null;
  return (
    <Link
      href={href}
      className={`block rounded-xl p-4 shadow-sm ring-1 transition-colors ${c ? `${c.fondo} ${c.borde} hover:brightness-95` : "bg-white ring-slate-200 hover:bg-slate-50"}`}
    >
      <div className="text-sm font-medium text-slate-700">{titulo}</div>
      <div className="cifra mt-1 text-3xl font-bold text-slate-900">{valor}</div>
      {pie && <div className="mt-1 text-xs text-slate-600">{pie}</div>}
    </Link>
  );
}
