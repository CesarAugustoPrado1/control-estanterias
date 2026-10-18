"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorDeProducto } from "@/lib/colores";
import type { Cemento } from "@/lib/db/schema";

/**
 * Elegir un producto viendo su color. El <select> nativo no deja pintar las
 * opciones en el celular (Android y iPhone ignoran los estilos), y lo que se
 * busca es justamente no confundir "Ekos Gris" con "Ekos Beige" de un vistazo.
 */

export type ProductoConColor = {
  id: number;
  nombre: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Muestra({
  nombre,
  familia,
  grande,
}: {
  nombre: string;
  familia?: string | null;
  grande?: boolean;
}) {
  const c = colorDeProducto(nombre, familia);
  return (
    <span
      aria-hidden
      title={c.nombre}
      className={`inline-block shrink-0 rounded-full ${grande ? "h-6 w-6" : "h-4 w-4"} ${c.claro ? "ring-1 ring-slate-300" : ""}`}
      style={{ backgroundColor: c.hex }}
    />
  );
}

export function SelectorProducto<P extends ProductoConColor>({
  productos,
  valor,
  alElegir,
  pista,
}: {
  productos: P[];
  valor: string;
  alElegir: (id: string) => void;
  /** Texto chico a la derecha de cada producto (por ejemplo, cuantas hay listas). */
  pista?: (p: P) => { texto: string; alerta?: boolean } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const buscador = useRef<HTMLInputElement>(null);
  const elegido = productos.find((p) => String(p.id) === valor) ?? null;

  useEffect(() => {
    if (abierto) buscador.current?.focus();
  }, [abierto]);

  const grupos = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    const m = new Map<string, P[]>();
    for (const p of productos) {
      const texto = normalizar(`${p.nombre} ${p.modelo} ${p.familia}`);
      if (!palabras.every((w) => texto.includes(w))) continue;
      m.set(p.modelo, [...(m.get(p.modelo) ?? []), p]);
    }
    return [...m];
  }, [productos, busqueda]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-white px-3 text-left ring-1 ring-slate-300 hover:ring-blue-400"
      >
        {elegido ? (
          <>
            <Muestra nombre={elegido.nombre} familia={elegido.familia} grande />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{elegido.nombre}</span>
            {elegido.cemento === "blanco" && (
              <span className="shrink-0 rounded border border-slate-900 px-1 text-[10px] font-bold">
                C. BLANCO
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-slate-500">Elegí el producto…</span>
        )}
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-white ring-2 ring-blue-600">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        <input
          ref={buscador}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar: ekos gris, liston…"
          className="min-h-11 w-full rounded-md bg-slate-50 px-3 text-base outline-none ring-1 ring-slate-200 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setBusqueda("");
          }}
          className="min-h-11 shrink-0 px-2 text-sm font-semibold text-slate-600"
        >
          Cerrar
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {grupos.length === 0 && <p className="p-3 text-sm text-slate-500">Ningún producto coincide.</p>}
        {grupos.map(([modelo, ps]) => (
          <div key={modelo}>
            <div className="sticky top-0 bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
              {modelo}
            </div>
            <ul>
              {ps.map((p) => {
                const pi = pista?.(p) ?? null;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        alElegir(String(p.id));
                        setAbierto(false);
                        setBusqueda("");
                      }}
                      className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 ${
                        String(p.id) === valor ? "bg-blue-50" : ""
                      }`}
                    >
                      <Muestra nombre={p.nombre} familia={p.familia} grande />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{p.nombre}</span>
                        {p.cemento === "blanco" && (
                          <span className="text-[11px] font-bold tracking-wide text-slate-700">
                            CEMENTO BLANCO
                          </span>
                        )}
                      </span>
                      {pi && (
                        <span
                          className={`shrink-0 text-xs ${pi.alerta ? "font-semibold text-amber-700" : "text-slate-500"}`}
                        >
                          {pi.texto}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
