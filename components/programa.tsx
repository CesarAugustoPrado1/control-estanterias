"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  accionBorrarLinea,
  accionEditarLinea,
  accionInformarMotivo,
  accionMoverLinea,
  accionReprogramar,
} from "@/lib/acciones/programa";
import type { Cemento, SeccionPrograma } from "@/lib/db/schema";
import { usarAccion } from "@/components/usar-accion";
import { ChipCemento } from "@/components/tanda";
import { Muestra } from "@/components/selector-producto";
import { Aviso, Boton, Campo, Entrada, Selector } from "@/components/ui";

/**
 * Las lineas del programa, como en la hoja: "2 Ekos Gris (Quilmes) 29597",
 * con lo hecho al lado. La usan la pestana Programa (para armarlo y
 * compararlo), el trompo y el desmolde (para verlo e informar motivos).
 */

export type Linea = {
  id: number;
  seccion: SeccionPrograma;
  productoId: number;
  producto: string;
  /** Para el color de la muestra. */
  familia?: string;
  cemento: Cemento;
  cantidad: number;
  nota: string | null;
  hechas: number;
  faltan: number;
  motivoId: number | null;
  motivoNombre: string | null;
  motivoNota: string | null;
  motivoPor: string | null;
  reprogramadaA: string | null;
  origenDia: string | null;
};

export type Motivo = { id: number; nombre: string };

/** "16/10" sin pasar por la zona horaria. */
const corto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function ListaPrograma({
  lineas,
  motivos,
  editar = false,
  informar = false,
  /** El dia ya termino (o se cerro): lo que falta se marca como no cumplido. */
  terminado,
  manana,
  alElegir,
  advertencias = {},
  vacio = "No hay nada programado.",
}: {
  lineas: Linea[];
  motivos: Motivo[];
  editar?: boolean;
  informar?: boolean;
  terminado: boolean;
  /** Dia sugerido para reprogramar. */
  manana?: string;
  /** En el trompo: tocar la linea elige ese producto. */
  /** Por id de linea: aviso no bloqueante (por ejemplo, desmolde antes de tiempo). */
  advertencias?: Record<number, string>;
  alElegir?: (l: Linea) => void;
  vacio?: string;
}) {
  if (!lineas.length) {
    return (
      <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500 ring-1 ring-slate-200">
        {vacio}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {lineas.map((l, i) => (
        <FilaLinea
          key={l.id}
          l={l}
          motivos={motivos}
          editar={editar}
          informar={informar}
          terminado={terminado}
          manana={manana}
          alElegir={alElegir}
          advertencia={advertencias[l.id]}
          primera={i === 0}
          ultima={i === lineas.length - 1}
        />
      ))}
    </ul>
  );
}

function FilaLinea({
  l,
  motivos,
  editar,
  informar,
  terminado,
  manana,
  alElegir,
  advertencia,
  primera,
  ultima,
}: {
  l: Linea;
  motivos: Motivo[];
  editar: boolean;
  informar: boolean;
  terminado: boolean;
  manana?: string;
  advertencia?: string;
  alElegir?: (l: Linea) => void;
  primera: boolean;
  ultima: boolean;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "editar" | "reprogramar" | "motivo">(null);
  const refrescar = () => {
    setModo(null);
    router.refresh();
  };
  const mover = usarAccion(accionMoverLinea, { alTerminar: () => router.refresh() });
  const borrar = usarAccion(accionBorrarLinea, { alTerminar: () => router.refresh() });

  const completa = l.hechas >= l.cantidad;
  const incumplida = terminado && l.faltan > 0;
  const pct = Math.min(100, (100 * l.hechas) / l.cantidad);
  const color = completa
    ? "bg-emerald-500"
    : incumplida
      ? "bg-red-500"
      : l.hechas > 0
        ? "bg-blue-600"
        : "bg-slate-300";

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cifra text-lg font-bold text-slate-900">{l.cantidad}</span>
            <Muestra nombre={l.producto} familia={l.familia} />
            <span className="font-semibold text-slate-900">{l.producto}</span>
            {l.cemento === "blanco" && <ChipCemento cemento="blanco" />}
          </div>
          {l.nota && <div className="text-sm text-slate-600">{l.nota}</div>}
          {l.origenDia && (
            <div className="text-xs text-violet-700">Reprogramada desde el {corto(l.origenDia)}</div>
          )}
          {advertencia && (
            <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
              <strong>Ojo:</strong> {advertencia}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`cifra text-lg font-bold ${completa ? "text-emerald-700" : incumplida ? "text-red-700" : "text-slate-900"}`}
          >
            {l.hechas}
            <span className="text-sm font-medium text-slate-400"> / {l.cantidad}</span>
          </div>
          <div
            className={`text-xs ${completa ? "text-emerald-700" : incumplida ? "text-red-700" : "text-slate-500"}`}
          >
            {completa
              ? "cumplida"
              : incumplida
                ? `faltó ${l.faltan}`
                : `falta${l.faltan === 1 ? "" : "n"} ${l.faltan}`}
          </div>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );

  return (
    <li className={`rounded-xl bg-white shadow-sm ring-1 ${incumplida ? "ring-red-200" : "ring-slate-200"}`}>
      {alElegir && !completa ? (
        <button
          type="button"
          onClick={() => alElegir(l)}
          className="block w-full p-3 text-left hover:bg-slate-50"
        >
          {cuerpo}
          <div className="mt-1 text-xs font-semibold text-blue-700">Tocá para cargar este producto</div>
        </button>
      ) : (
        <div className="p-3">{cuerpo}</div>
      )}

      {/* Motivo, reprogramacion y acciones */}
      {(l.faltan > 0 || editar) && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
          {l.faltan > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {l.motivoNombre ? (
                <span className="text-slate-700">
                  <span className="font-semibold">Motivo:</span> {l.motivoNombre}
                  {l.motivoNota && <> · {l.motivoNota}</>}
                  {l.motivoPor && <span className="text-slate-400"> ({l.motivoPor})</span>}
                </span>
              ) : (
                <span className={incumplida ? "font-semibold text-red-700" : "text-slate-400"}>
                  {incumplida ? "Sin motivo informado" : "Si no se llega, informá el motivo"}
                </span>
              )}
              {informar && (
                <button
                  type="button"
                  onClick={() => setModo(modo === "motivo" ? null : "motivo")}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  {l.motivoNombre ? "Cambiar motivo" : "Informar motivo"}
                </button>
              )}
            </div>
          )}
          {l.reprogramadaA && <div className="text-violet-700">Reprogramada al {corto(l.reprogramadaA)}</div>}
          {editar && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button
                type="button"
                className="font-semibold text-slate-600 hover:underline"
                onClick={() => setModo(modo === "editar" ? null : "editar")}
              >
                Editar
              </button>
              {l.faltan > 0 && !l.reprogramadaA && (
                <button
                  type="button"
                  className="font-semibold text-violet-700 hover:underline"
                  onClick={() => setModo(modo === "reprogramar" ? null : "reprogramar")}
                >
                  Reprogramar
                </button>
              )}
              {!primera && (
                <button
                  type="button"
                  aria-label="Subir"
                  className="font-semibold text-slate-600"
                  disabled={mover.cargando}
                  onClick={() => mover.enviar(datos({ id: l.id, hacia: "arriba" }))}
                >
                  ↑
                </button>
              )}
              {!ultima && (
                <button
                  type="button"
                  aria-label="Bajar"
                  className="font-semibold text-slate-600"
                  disabled={mover.cargando}
                  onClick={() => mover.enviar(datos({ id: l.id, hacia: "abajo" }))}
                >
                  ↓
                </button>
              )}
              <button
                type="button"
                className="ml-auto font-semibold text-red-700 hover:underline"
                disabled={borrar.cargando}
                onClick={() => {
                  if (confirm(`¿Borrar ${l.cantidad} ${l.producto} del programa?`))
                    borrar.enviar(datos({ id: l.id }));
                }}
              >
                Borrar
              </button>
            </div>
          )}
          {(mover.error || borrar.error) && <Aviso tono="error">{mover.error ?? borrar.error}</Aviso>}

          {modo === "motivo" && <FormMotivo l={l} motivos={motivos} alTerminar={refrescar} />}
          {modo === "editar" && <FormEditar l={l} alTerminar={refrescar} />}
          {modo === "reprogramar" && <FormReprogramar l={l} manana={manana} alTerminar={refrescar} />}
        </div>
      )}
    </li>
  );
}

function datos(o: Record<string, string | number>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, String(v));
  return fd;
}

function FormMotivo({ l, motivos, alTerminar }: { l: Linea; motivos: Motivo[]; alTerminar: () => void }) {
  const [motivoId, setMotivoId] = useState(l.motivoId ? String(l.motivoId) : "");
  const [nota, setNota] = useState(l.motivoNota ?? "");
  const a = usarAccion(accionInformarMotivo, { alTerminar });
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <Campo etiqueta={`¿Por qué no se hicieron las ${l.faltan} que faltan?`}>
        <Selector value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
          <option value="">Elegí el motivo…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Detalle (opcional)">
        <Entrada
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: se cortó la luz a las 15"
        />
      </Campo>
      {a.error && <Aviso tono="error">{a.error}</Aviso>}
      <Boton
        type="button"
        disabled={a.cargando || !motivoId}
        onClick={() => a.enviar(datos({ id: l.id, motivoId, motivoNota: nota }))}
      >
        {a.cargando ? "Guardando…" : "Guardar motivo"}
      </Boton>
    </div>
  );
}

function FormEditar({ l, alTerminar }: { l: Linea; alTerminar: () => void }) {
  const [cantidad, setCantidad] = useState(String(l.cantidad));
  const [nota, setNota] = useState(l.nota ?? "");
  const a = usarAccion(accionEditarLinea, { alTerminar });
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Campo etiqueta="Maquinadas">
          <Entrada
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
            className="cifra"
          />
        </Campo>
        <Campo etiqueta="Nota">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cliente, pedido…" />
        </Campo>
      </div>
      {a.error && <Aviso tono="error">{a.error}</Aviso>}
      <Boton
        type="button"
        disabled={a.cargando}
        onClick={() => a.enviar(datos({ id: l.id, cantidad, nota }))}
      >
        {a.cargando ? "Guardando…" : "Guardar"}
      </Boton>
    </div>
  );
}

function FormReprogramar({ l, manana, alTerminar }: { l: Linea; manana?: string; alTerminar: () => void }) {
  const [destino, setDestino] = useState(manana ?? "");
  const [cantidad, setCantidad] = useState(String(l.faltan));
  const a = usarAccion(accionReprogramar, { alTerminar });
  return (
    <div className="space-y-2 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200">
      <p className="text-violet-900">
        Pasa a otro día como una línea nueva, con la misma nota. Esta queda marcada como reprogramada.
      </p>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Campo etiqueta="Para el día">
          <Entrada type="date" value={destino} onChange={(e) => setDestino(e.target.value)} />
        </Campo>
        <Campo etiqueta="Maquinadas">
          <Entrada
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
            className="cifra"
          />
        </Campo>
      </div>
      {a.error && <Aviso tono="error">{a.error}</Aviso>}
      <Boton
        type="button"
        disabled={a.cargando || !destino}
        onClick={() => a.enviar(datos({ id: l.id, destino, cantidad }))}
      >
        {a.cargando ? "Reprogramando…" : "Reprogramar"}
      </Boton>
    </div>
  );
}
