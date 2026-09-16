"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Resultado } from "@/lib/acciones/comun";
import { usarAccion } from "@/components/usar-accion";
import {
  Aviso,
  Boton,
  Campo,
  Entrada,
  Selector,
  Tarjeta,
  Vacio,
} from "@/components/ui";

/**
 * ABM generico: una lista de filas que se expanden a formulario.
 *
 * Existe para que los siete maestros no sean siete pantallas casi iguales con
 * siete bugs distintos. Lo que cambia entre ellos son los campos, y eso es un
 * dato, no codigo.
 */

export type CampoDef = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "decimal" | "select" | "check" | "pin";
  opciones?: { valor: string | number; texto: string }[];
  requerido?: boolean;
  ayuda?: string;
  /** No se muestra al crear (por ejemplo "activo", que arranca en true). */
  soloEdicion?: boolean;
};

export type FilaEditable = {
  id: number;
  titulo: string;
  subtitulo?: string;
  etiquetas?: { texto: string; tono?: "gris" | "verde" | "ambar" | "rojo" }[];
  valores: Record<string, string | number | boolean | null>;
  /** Motivo por el que no se puede editar (por ejemplo, en uso). */
  bloqueada?: string;
};

const TONOS = {
  gris: "bg-slate-100 text-slate-700",
  verde: "bg-emerald-100 text-emerald-800",
  ambar: "bg-amber-100 text-amber-800",
  rojo: "bg-red-100 text-red-800",
};

export function EditorFilas({
  campos,
  filas,
  accion,
  etiquetaNuevo = "Agregar",
  ayuda,
}: {
  campos: CampoDef[];
  filas: FilaEditable[];
  accion: (fd: FormData) => Promise<Resultado<void>>;
  etiquetaNuevo?: string;
  ayuda?: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState<number | "nueva" | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {ayuda ? (
          <p className="max-w-2xl text-sm text-slate-600">{ayuda}</p>
        ) : (
          <span />
        )}
        <Boton
          type="button"
          onClick={() => setAbierta(abierta === "nueva" ? null : "nueva")}
        >
          {abierta === "nueva" ? "Cancelar" : etiquetaNuevo}
        </Boton>
      </div>

      {abierta === "nueva" && (
        <Tarjeta className="mb-3 ring-2 ring-blue-600">
          <Formulario
            campos={campos.filter((c) => !c.soloEdicion)}
            valores={{}}
            accion={accion}
            alTerminar={() => setAbierta(null)}
          />
        </Tarjeta>
      )}

      {filas.length === 0 ? (
        <Vacio>Todavía no hay nada cargado.</Vacio>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <li key={f.id}>
              <div
                className={`rounded-xl bg-white shadow-sm ring-1 ${
                  abierta === f.id ? "ring-2 ring-blue-600" : "ring-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {f.titulo}
                      </span>
                      {f.etiquetas?.map((e, i) => (
                        <span
                          key={i}
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONOS[e.tono ?? "gris"]}`}
                        >
                          {e.texto}
                        </span>
                      ))}
                    </div>
                    {f.subtitulo && (
                      <div className="text-sm text-slate-600">{f.subtitulo}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-blue-700">
                    {abierta === f.id ? "Cerrar" : "Editar"}
                  </span>
                </button>

                {abierta === f.id && (
                  <div className="border-t border-slate-100 p-3">
                    {f.bloqueada && (
                      <div className="mb-3">
                        <Aviso tono="atencion">{f.bloqueada}</Aviso>
                      </div>
                    )}
                    <Formulario
                      campos={campos}
                      valores={{ ...f.valores, id: f.id }}
                      accion={accion}
                      alTerminar={() => setAbierta(null)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Formulario({
  campos,
  valores,
  accion,
  alTerminar,
}: {
  campos: CampoDef[];
  valores: Record<string, string | number | boolean | null>;
  accion: (fd: FormData) => Promise<Resultado<void>>;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const { enviar, cargando, error, reintentando } = usarAccion(accion, {
    alTerminar: () => {
      alTerminar();
      router.refresh();
    },
  });

  return (
    <form action={enviar} className="space-y-3">
      {valores.id !== undefined && (
        <input type="hidden" name="id" value={String(valores.id)} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map((c) => {
          const v = valores[c.clave];
          if (c.tipo === "check") {
            return (
              <label
                key={c.clave}
                className="flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3 ring-1 ring-slate-200"
              >
                <input
                  type="checkbox"
                  name={c.clave}
                  defaultChecked={v === undefined ? true : Boolean(v)}
                  className="h-6 w-6 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  {c.etiqueta}
                </span>
              </label>
            );
          }
          if (c.tipo === "select") {
            return (
              <Campo key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda}>
                <Selector
                  name={c.clave}
                  defaultValue={v === null || v === undefined ? "" : String(v)}
                  required={c.requerido}
                >
                  <option value="">Elegí…</option>
                  {c.opciones?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </Selector>
              </Campo>
            );
          }
          return (
            <Campo key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda}>
              <Entrada
                name={c.clave}
                defaultValue={v === null || v === undefined ? "" : String(v)}
                required={c.requerido}
                inputMode={
                  c.tipo === "numero" || c.tipo === "pin"
                    ? "numeric"
                    : c.tipo === "decimal"
                      ? "decimal"
                      : undefined
                }
                type={c.tipo === "pin" ? "password" : "text"}
                autoComplete={c.tipo === "pin" ? "new-password" : undefined}
                className={c.tipo === "texto" ? "" : "cifra"}
              />
            </Campo>
          );
        })}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {reintentando > 0 && (
        <Aviso tono="atencion">Sin respuesta, reintentando ({reintentando}/3)…</Aviso>
      )}

      <div className="flex gap-2">
        <Boton type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar"}
        </Boton>
        <Boton type="button" tono="fantasma" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
