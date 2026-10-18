"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  accionAgregarLinea,
  accionCerrarDia,
  accionCopiarDia,
  accionGuardarMeta,
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
  meta,
  programadas,
}: {
  dia: string;
  seccion: SeccionPrograma;
  productos: ProductoElegible[];
  /** Meta de maquinadas de la seccion; null si el dia no tiene. */
  meta: number | null;
  /** Lo que ya suman las lineas de la seccion. */
  programadas: number;
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

  const n = Number(cantidad) || 0;
  const conEsta = programadas + n;

  const agregar = () => {
    if (meta !== null && conEsta > meta) {
      const ok = confirm(
        `Con esta línea programás ${conEsta} maquinadas y la meta es ${meta}: te pasás por ${conEsta - meta}.\n\n¿Agregarla igual?`,
      );
      if (!ok) return;
    }
    a.enviar(datos({ dia, seccion, productoId, cantidad, nota }));
  };

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
      {meta !== null && n > 0 && (
        <p
          className={`cifra rounded-lg px-3 py-2 text-sm font-semibold ${
            conEsta > meta
              ? "bg-red-50 text-red-800 ring-1 ring-red-200"
              : conEsta === meta
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-slate-50 text-slate-700 ring-1 ring-slate-200"
          }`}
        >
          Con esta línea: {conEsta} de {meta}
          {conEsta > meta
            ? ` · te pasás por ${conEsta - meta}`
            : conEsta === meta
              ? " · llegás justo a la meta"
              : ` · quedan ${meta - conEsta}`}
        </p>
      )}
      {a.error && <Aviso tono="error">{a.error}</Aviso>}
      <div className="flex gap-2">
        <Boton type="button" disabled={a.cargando || !productoId || !cantidad} onClick={agregar}>
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

/**
 * Meta de maquinadas de una seccion y cuanto lleva programado. Lo que importa
 * al armar el dia: cuantas faltan para la meta, o por cuantas se paso.
 */
export function MetaSeccion({
  dia,
  seccion,
  meta,
  sugerida,
  programadas,
  hechas,
  editar,
}: {
  dia: string;
  seccion: SeccionPrograma;
  meta: number | null;
  /** Ultima meta usada, para proponerla en un dia sin meta. */
  sugerida: number | null;
  programadas: number;
  /** Lo hecho de verdad en la seccion ese dia, programado o no. */
  hechas: number;
  editar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(meta ?? sugerida ?? ""));
  const a = usarAccion(accionGuardarMeta, {
    alTerminar: () => {
      setEditando(false);
      router.refresh();
    },
  });

  if (editando || (meta === null && editar)) {
    return (
      <div className="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-end gap-2">
          <Campo etiqueta="Meta de maquinadas del día">
            <Entrada
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
              placeholder="Ej: 16"
              className="cifra w-28 text-lg font-bold"
            />
          </Campo>
          <Boton
            type="button"
            disabled={a.cargando || !valor}
            onClick={() => a.enviar(datos({ dia, seccion, meta: valor }))}
          >
            {a.cargando ? "Guardando…" : meta === null ? "Fijar meta" : "Guardar"}
          </Boton>
          {editando && (
            <Boton type="button" tono="fantasma" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          )}
          {editando && meta !== null && (
            <button
              type="button"
              className="min-h-12 px-2 text-sm font-semibold text-red-700 hover:underline"
              disabled={a.cargando}
              onClick={() => a.enviar(datos({ dia, seccion, meta: "" }))}
            >
              Quitar meta
            </button>
          )}
        </div>
        {meta === null && sugerida !== null && (
          <p className="mt-1 text-xs text-slate-500">Propuesta: la última meta que usaste ({sugerida}).</p>
        )}
        {a.error && (
          <div className="mt-2">
            <Aviso tono="error">{a.error}</Aviso>
          </div>
        )}
      </div>
    );
  }

  if (meta === null) return null;

  // Lo principal: cuanto se hizo de verdad contra la meta.
  const pctHechas = Math.round((100 * hechas) / meta);
  const llego = hechas >= meta;
  // Debajo, para armar el dia: lo programado contra la meta.
  const pasado = programadas > meta;
  const justo = programadas === meta;
  // Plegado queda "Meta del dia" con lo hecho y la barra; lo de abajo (programado
  // y cambiar la meta) se ve al desplegar.
  return (
    <details
      open
      className={`group mb-3 rounded-xl bg-white shadow-sm ring-1 ${llego ? "ring-emerald-300" : "ring-slate-200"}`}
    >
      <summary className="block cursor-pointer list-none p-3 select-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta del día</span>
          <span
            aria-hidden
            className="text-lg leading-none text-slate-400 transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="cifra">
            <span className="text-sm text-slate-600">Hechas </span>
            <span className={`text-2xl font-bold ${llego ? "text-emerald-700" : "text-slate-900"}`}>
              {hechas}
            </span>
            <span className="text-lg font-medium text-slate-400"> / {meta}</span>
          </div>
          <div className={`cifra text-2xl font-bold ${llego ? "text-emerald-700" : "text-blue-700"}`}>
            {pctHechas} %
          </div>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded bg-slate-100">
          <div
            className={`h-full rounded ${llego ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${Math.min(100, pctHechas)}%` }}
          />
        </div>
      </summary>
      <div className="px-3 pb-3">
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
          <span className="cifra text-slate-600">
            Programadas{" "}
            <strong className={pasado ? "text-red-700" : justo ? "text-emerald-700" : "text-slate-900"}>
              {programadas}
            </strong>{" "}
            / {meta}
          </span>
          <span
            className={`font-semibold ${pasado ? "text-red-700" : justo ? "text-emerald-700" : "text-amber-700"}`}
          >
            {pasado
              ? `Te pasaste por ${programadas - meta}`
              : justo
                ? "Programa completo"
                : `Faltan programar ${meta - programadas}`}
          </span>
        </div>
        {editar && (
          <button
            type="button"
            onClick={() => {
              setValor(String(meta));
              setEditando(true);
            }}
            className="mt-2 text-sm font-semibold text-blue-700 hover:underline"
          >
            Cambiar meta
          </button>
        )}
      </div>
    </details>
  );
}
