"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionGuardarLavados } from "@/lib/acciones/lavados";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton } from "@/components/ui";
import type { Tono } from "@/lib/escala";

type Dia = { dia: string; cantidad: number | null };

const MAS_MENOS =
  "inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white text-2xl font-bold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-300";

/**
 * Contador de lavados del trompo. No cuenta el lavado de fin de jornada, que
 * se hace siempre: solo los de mas. Se guarda el numero, no se suma, asi que
 * tocar Guardar dos veces no duplica nada.
 *
 * Arranca en hoy; "Ayer" queda a mano por si se olvidaron de cargarlo.
 */
export function LavadosTrompo({ hoy, ayer, tono }: { hoy: Dia; ayer: Dia; tono?: Tono }) {
  const router = useRouter();
  const [cual, setCual] = useState<"hoy" | "ayer">("hoy");
  const elegido = cual === "hoy" ? hoy : ayer;
  const [valores, setValores] = useState({ hoy: hoy.cantidad ?? 0, ayer: ayer.cantidad ?? 0 });
  const valor = valores[cual];
  const a = usarAccion(accionGuardarLavados, { alTerminar: () => router.refresh() });
  const cambiado = elegido.cantidad === null || valor !== elegido.cantidad;

  function poner(n: number) {
    a.limpiar();
    setValores((v) => ({ ...v, [cual]: Math.max(0, Math.min(50, n)) }));
  }

  function guardar() {
    const fd = new FormData();
    fd.set("dia", elegido.dia);
    fd.set("cantidad", String(valor));
    a.enviar(fd);
  }

  return (
    <section className={`mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${tono ? `border-l-[6px] ${tono.franja}` : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Lavados del trompo</h2>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          {(["hoy", "ayer"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                a.limpiar();
                setCual(d);
              }}
              className={`min-h-9 rounded-md px-3 ${cual === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {d === "hoy" ? "Hoy" : "Ayer"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Cuántas veces se lavó <strong>sin contar el último lavado</strong>, el de fin del día.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" aria-label="Uno menos" className={MAS_MENOS} disabled={valor === 0} onClick={() => poner(valor - 1)}>
          −
        </button>
        <span className="cifra w-12 text-center text-3xl font-bold text-slate-900" aria-live="polite">
          {valor}
        </span>
        <button type="button" aria-label="Uno más" className={MAS_MENOS} onClick={() => poner(valor + 1)}>
          +
        </button>
        <Boton className="ml-auto" onClick={guardar} disabled={!cambiado || a.cargando}>
          {a.cargando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>

      <div className="mt-2 text-sm">
        {a.error ? (
          <Aviso tono="error">{a.error}</Aviso>
        ) : elegido.cantidad === null ? (
          <span className="text-amber-700">
            {cual === "hoy" ? "Hoy" : "Ayer"} todavía no se cargó. Si no hubo lavados de más, guardá 0.
          </span>
        ) : cambiado ? (
          <span className="text-slate-500">Guardado: {elegido.cantidad}. Tocá Guardar para cambiarlo.</span>
        ) : (
          <span className="text-emerald-700">✓ Guardado.</span>
        )}
      </div>
    </section>
  );
}
