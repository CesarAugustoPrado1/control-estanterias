"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  accionAgregarLinea,
  accionCerrarDia,
  accionCopiarDia,
  accionReabrirDia,
} from "@/lib/acciones/programa";
import type { Cemento, SeccionPrograma } from "@/lib/db/schema";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Selector } from "@/components/ui";

type ProductoElegible = { id: number; nombre: string; modelo: string; cemento: Cemento };

function datos(o: Record<string, string | number>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, String(v));
  return fd;
}

/** Agregar una linea al final de una seccion, como quien escribe un renglon mas en la hoja. */
export function AgregarLinea({
  dia,
  seccion,
  productos,
}: {
  dia: string;
  seccion: SeccionPrograma;
  productos: ProductoElegible[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [nota, setNota] = useState("");
  const a = usarAccion(accionAgregarLinea, {
    alTerminar: () => {
      // Queda abierto para seguir cargando renglones: solo se limpia.
      setProductoId("");
      setCantidad("1");
      setNota("");
      router.refresh();
    },
  });
  const porModelo = useMemo(() => {
    const m = new Map<string, ProductoElegible[]>();
    for (const p of productos) m.set(p.modelo, [...(m.get(p.modelo) ?? []), p]);
    return [...m];
  }, [productos]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-700"
      >
        + Agregar línea
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-white p-3 shadow-sm ring-2 ring-blue-600">
      <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
        <Campo etiqueta="Maquinadas">
          <Entrada
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
            className="cifra text-lg font-bold"
          />
        </Campo>
        <Campo etiqueta="Producto">
          <Selector value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Elegí el producto…</option>
            {porModelo.map(([modelo, ps]) => (
              <optgroup key={modelo} label={modelo}>
                {ps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.cemento === "blanco" ? " · CEMENTO BLANCO" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Selector>
        </Campo>
      </div>
      <Campo etiqueta="Nota (opcional)" ayuda="Como en la hoja: cliente, pedido, 11/15, STR, a confirmar…">
        <Entrada
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: Quilmes 29597 10/9"
        />
      </Campo>
      {a.error && <Aviso tono="error">{a.error}</Aviso>}
      <div className="flex gap-2">
        <Boton
          type="button"
          disabled={a.cargando || !productoId || !cantidad}
          onClick={() => a.enviar(datos({ dia, seccion, productoId, cantidad, nota }))}
        >
          {a.cargando ? "Agregando…" : "Agregar"}
        </Boton>
        <Boton type="button" tono="fantasma" onClick={() => setAbierto(false)}>
          Listo
        </Boton>
      </div>
    </div>
  );
}

/** Cerrar / reabrir el dia, y copiar el programa de otro dia. */
export function AccionesDia({
  dia,
  cerrado,
  hayLineas,
  sinMotivo,
  sugerirCopiaDe,
}: {
  dia: string;
  cerrado: boolean;
  hayLineas: boolean;
  /** Lineas con faltantes sin motivo: se avisa antes de cerrar. */
  sinMotivo: number;
  sugerirCopiaDe: string;
}) {
  const router = useRouter();
  const [copiando, setCopiando] = useState(false);
  const [desde, setDesde] = useState(sugerirCopiaDe);
  const cerrar = usarAccion(accionCerrarDia, { alTerminar: () => router.refresh() });
  const reabrir = usarAccion(accionReabrirDia, { alTerminar: () => router.refresh() });
  const copiar = usarAccion(accionCopiarDia, {
    alTerminar: () => {
      setCopiando(false);
      router.refresh();
    },
  });
  const error = cerrar.error ?? reabrir.error ?? copiar.error;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!cerrado && hayLineas && (
          <Boton
            type="button"
            disabled={cerrar.cargando}
            onClick={() => {
              const aviso = sinMotivo
                ? `Hay ${sinMotivo} línea${sinMotivo === 1 ? "" : "s"} sin cumplir y sin motivo. ¿Cerrar igual?\n\n`
                : "";
              if (
                confirm(`${aviso}Al cerrar queda registrado el cumplimiento del día tal como está ahora.`)
              ) {
                cerrar.enviar(datos({ dia }));
              }
            }}
          >
            {cerrar.cargando ? "Cerrando…" : "Cerrar el día"}
          </Boton>
        )}
        {cerrado && (
          <Boton
            type="button"
            tono="neutro"
            disabled={reabrir.cargando}
            onClick={() => {
              if (
                confirm(
                  "Reabrir descarta el cumplimiento registrado. Al volver a cerrar se toma lo que haya en ese momento.",
                )
              )
                reabrir.enviar(datos({ dia }));
            }}
          >
            {reabrir.cargando ? "Reabriendo…" : "Reabrir el día"}
          </Boton>
        )}
        {!cerrado && (
          <Boton type="button" tono="neutro" onClick={() => setCopiando((v) => !v)}>
            Copiar de otro día
          </Boton>
        )}
      </div>
      {copiando && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <Campo etiqueta="Copiar el programa del">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Boton
            type="button"
            disabled={copiar.cargando || !desde}
            onClick={() => copiar.enviar(datos({ desde, hacia: dia }))}
          >
            {copiar.cargando ? "Copiando…" : "Copiar"}
          </Boton>
          <p className="w-full text-xs text-slate-500">
            Se agregan al final. No se copia lo hecho ni los motivos.
          </p>
        </div>
      )}
      {copiar.ok !== null && copiar.ok > 0 && <Aviso tono="ok">Se copiaron {copiar.ok} líneas.</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
