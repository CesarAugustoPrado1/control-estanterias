"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  accionAgregarLinea,
  accionCerrarDia,
  accionCopiarDia,
  accionGuardarMeta,
  accionReabrirDia,
} from "@/lib/acciones/programa";
import type { Cemento, SeccionPrograma } from "@/lib/db/schema";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";
import { SelectorProducto } from "@/components/selector-producto";
import { nombreDia, sumarDias } from "@/lib/periodo";
import type { CargaDesmolde } from "@/lib/programa";
import { MARGEN_DESMOLDE, topeDesmolde } from "@/lib/reglas";

type ProductoElegible = {
  id: number;
  nombre: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
  diasDesmolde: number;
};

/**
 * Primer dia HABIL desde `desde` en que caben `n` desmoldes sin pasarse
 * de la meta ni del tope por diferencia con el llenado (lib/reglas.ts). Un dia
 * sin meta tiene lugar. Si no hay ninguno en el horizonte,
 * el primer dia posible.
 */
function sugerirDesmolde(desde: string, n: number, carga: CargaDesmolde): string {
  for (let i = 0; i < 45; i++) {
    const d = sumarDias(desde, i);
    const c = carga[d];
    if (!c) break;
    if (!c.habil) continue;
    if (c.cerrado) continue;
    const tope = topeDesmolde(c.llenado);
    if (tope !== null && c.programadas + n > tope) continue;
    if (c.meta == null || c.programadas + n <= c.meta) return d;
  }
  // Sin lugar en el horizonte: al menos el primer dia habil.
  for (let i = 0; i < 45; i++) {
    const d = sumarDias(desde, i);
    if (carga[d]?.habil) return d;
  }
  return desde;
}

const plazo = (d: number) => (d === 1 ? "1 día" : `${d} días`);
/** "miércoles 21/10" */
const diaCorto = (d: string) =>
  nombreDia(d)
    .replace(/\/\d{4}$/, "")
    .replace(",", "");

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
  listas,
  carga,
  llenadoDelDia = 0,
}: {
  dia: string;
  seccion: SeccionPrograma;
  productos: ProductoElegible[];
  /**
   * Solo desmolde: cuantas de cada producto van a estar listas para desmoldar
   * ese dia, ya descontado lo programado. Sale del tiempo de desmolde.
   */
  listas?: Record<number, number>;
  /** Meta de maquinadas de la seccion; null si el dia no tiene. */
  meta: number | null;
  /** Lo que ya suman las lineas de la seccion. */
  programadas: number;
  /** Solo llenado: carga de desmolde de los dias siguientes, para sugerir cuando desmoldar. */
  carga?: CargaDesmolde;
  /** Solo desmolde: llenados programados ese dia, que ponen el tope (lib/reglas.ts). */
  llenadoDelDia?: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [nota, setNota] = useState("");
  // Llenado: programar tambien el desmolde, con un dia sugerido que se puede cambiar.
  const [conDesmolde, setConDesmolde] = useState(true);
  const [desmoldeElegido, setDesmoldeElegido] = useState<string | null>(null);
  const a = usarAccion(accionAgregarLinea, {
    alTerminar: () => {
      // Queda abierto para seguir cargando renglones: solo se limpia.
      setProductoId("");
      setCantidad("1");
      setNota("");
      setDesmoldeElegido(null);
      router.refresh();
    },
  });
  const n = Number(cantidad) || 0;
  const elegido = productos.find((p) => String(p.id) === productoId) ?? null;
  const listasElegido = elegido && listas ? (listas[elegido.id] ?? 0) : null;
  const pocasListas = listasElegido !== null && n > listasElegido;
  const conEsta = programadas + n;

  // Desmolde de lo que se llena: el primer dia que cumple el tiempo de
  // desmolde y es habil y tiene lugar en la meta. Es solo la sugerencia.
  const desdeDia = elegido ? sumarDias(dia, elegido.diasDesmolde) : null;
  const sugerido =
    seccion === "llenado" && desdeDia && carga ? sugerirDesmolde(desdeDia, n || 1, carga) : null;
  const desmoldeDia = desmoldeElegido ?? sugerido;
  const cargaDia = desmoldeDia && carga ? carga[desmoldeDia] : undefined;
  const avisosDesmolde: string[] = [];
  if (seccion === "llenado" && conDesmolde && desmoldeDia && elegido) {
    if (desdeDia && desmoldeDia < desdeDia) {
      avisosDesmolde.push(
        `Es antes del tiempo mínimo de desmolde de ${elegido.nombre} (${plazo(elegido.diasDesmolde)}): se puede desde el ${diaCorto(desdeDia)}.`,
      );
    }
    if (cargaDia && !cargaDia.habil) {
      avisosDesmolde.push(`El ${diaCorto(desmoldeDia)} no es día hábil${cargaDia.motivo ? ` (${cargaDia.motivo})` : ""}.`);
    }
    if (cargaDia?.meta != null && cargaDia.programadas + n > cargaDia.meta) {
      avisosDesmolde.push(
        `Ese día quedarían ${cargaDia.programadas + n} maquinadas para desmoldar y la meta es ${cargaDia.meta}: te pasás por ${cargaDia.programadas + n - cargaDia.meta}.`,
      );
    }
    const topeDia = cargaDia ? topeDesmolde(cargaDia.llenado) : null;
    if (cargaDia && topeDia !== null && cargaDia.programadas + n > topeDia) {
      avisosDesmolde.push(
        `Ese día se llenan ${cargaDia.llenado}: con ${MARGEN_DESMOLDE} de diferencia el desmolde llega hasta ${topeDia}, y quedarían ${cargaDia.programadas + n}.`,
      );
    }
    if (cargaDia?.cerrado) avisosDesmolde.push("Ese día ya está cerrado: elegí otro.");
  }

  const tope = seccion === "desmolde" ? topeDesmolde(llenadoDelDia) : null;
  const pasaTope = tope !== null && conEsta > tope;

  const agregar = () => {
    const avisos: string[] = [];
    if (pasaTope) {
      avisos.push(
        `Ese día se llenan ${llenadoDelDia}: con ${MARGEN_DESMOLDE} de diferencia el desmolde llega hasta ${tope}, y quedarían ${conEsta}.`,
      );
    }
    if (meta !== null && conEsta > meta) {
      avisos.push(
        `Con esta línea programás ${conEsta} maquinadas y la meta es ${meta}: te pasás por ${conEsta - meta}.`,
      );
    }
    avisos.push(...avisosDesmolde.map((x) => `Desmolde: ${x}`));
    if (avisos.length && !confirm(`${avisos.join("\n\n")}\n\n¿Agregarla igual?`)) return;
    a.enviar(
      datos({
        dia,
        seccion,
        productoId,
        cantidad,
        nota,
        desmoldeDia: seccion === "llenado" && conDesmolde && desmoldeDia ? desmoldeDia : "",
      }),
    );
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
        <div className="space-y-1">
          <span className="block text-sm font-medium text-slate-700">Producto</span>
          <SelectorProducto
            productos={productos}
            valor={productoId}
            alElegir={setProductoId}
            pista={(p) => {
              if (seccion === "llenado") return { texto: `desmolde desde ${plazo(p.diasDesmolde)}` };
              const l = listas?.[p.id] ?? 0;
              return {
                texto: l === 0 ? "ninguna lista" : `${l} lista${l === 1 ? "" : "s"}`,
                alerta: l === 0,
              };
            }}
          />
        </div>
      </div>
      <Campo etiqueta="Nota (opcional)" ayuda="Como en la hoja: cliente, pedido, 11/15, STR, a confirmar…">
        <Entrada
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: Quilmes 29597 10/9"
        />
      </Campo>
      {elegido && seccion === "llenado" && (
        <div
          className={`space-y-2 rounded-lg p-3 ring-1 ${
            conDesmolde && avisosDesmolde.length ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"
          }`}
        >
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={conDesmolde}
              onChange={(e) => setConDesmolde(e.target.checked)}
              className="h-6 w-6 rounded border-slate-300"
            />
            <span className="text-sm font-semibold text-slate-800">Programar también el desmolde</span>
          </label>
          {conDesmolde ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <Campo etiqueta="Día de desmolde">
                  <Entrada
                    type="date"
                    value={desmoldeDia ?? ""}
                    min={sumarDias(dia, 1)}
                    onChange={(e) => setDesmoldeElegido(e.target.value || null)}
                  />
                </Campo>
                {desmoldeElegido && sugerido && desmoldeElegido !== sugerido && (
                  <button
                    type="button"
                    onClick={() => setDesmoldeElegido(null)}
                    className="min-h-12 text-sm font-semibold text-blue-700 hover:underline"
                  >
                    Volver al sugerido ({diaCorto(sugerido)})
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700">
                Tiempo mínimo de desmolde: {plazo(elegido.diasDesmolde)}. Se puede desde el{" "}
                <strong>{desdeDia && diaCorto(desdeDia)}</strong>; más tarde también está bien.
                {desmoldeDia === sugerido &&
                  sugerido &&
                  " Sugerido: el primer día hábil con lugar en la meta de desmolde."}
              </p>
              {cargaDia && desmoldeDia && (
                <p className="cifra text-sm text-slate-700">
                  {diaCorto(desmoldeDia)}: {cargaDia.programadas} programadas para desmoldar
                  {cargaDia.meta != null ? ` de ${cargaDia.meta}` : ""} → con estas {n || 0}:{" "}
                  <strong>
                    {cargaDia.programadas + n}
                    {cargaDia.meta != null ? ` de ${cargaDia.meta}` : ""}
                  </strong>
                  {cargaDia.meta == null && " (ese día no tiene meta)"}
                </p>
              )}
              {avisosDesmolde.map((x) => (
                <p key={x} className="text-sm text-amber-900">
                  <strong>Ojo:</strong> {x} Es una advertencia: se puede programar igual.
                </p>
              ))}
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Se va a poder desmoldar desde el <strong>{desdeDia && diaCorto(desdeDia)}</strong> (tiempo mínimo
              de desmolde: {plazo(elegido.diasDesmolde)}).
            </p>
          )}
        </div>
      )}
      {elegido && seccion === "desmolde" && listasElegido !== null && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            pocasListas
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : "bg-slate-50 text-slate-700 ring-slate-200"
          }`}
        >
          {pocasListas && <strong>Ojo: </strong>}
          {listasElegido === 0
            ? `No va a haber ${elegido.nombre} lista para desmoldar este día`
            : `Van a estar listas ${listasElegido} para desmoldar este día`}{" "}
          (tiempo mínimo de desmolde: {plazo(elegido.diasDesmolde)}).
          {pocasListas && " Es una advertencia: se puede programar igual."}
        </p>
      )}
      {pasaTope && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Ojo:</strong> ese día se llenan {llenadoDelDia}. Con {MARGEN_DESMOLDE} de diferencia, el
          desmolde llega hasta {tope} y con esta línea quedarían {conEsta}. Es una advertencia: se puede
          programar igual.
        </p>
      )}
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
