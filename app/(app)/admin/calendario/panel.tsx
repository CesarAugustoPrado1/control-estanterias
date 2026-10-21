"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionGuardarDiaCalendario, accionQuitarDiaCalendario } from "@/lib/acciones/calendario";
import { esFinDeSemana } from "@/lib/calendario";
import { nombreDia } from "@/lib/periodo";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Seccion, Selector } from "@/components/ui";

type Dia = { dia: string; laborable: boolean; nombre: string | null };

function datos(o: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
}

export function PanelCalendario({ dias, hoy }: { dias: Dia[]; hoy: string }) {
  const router = useRouter();
  const refrescar = { alTerminar: () => router.refresh() };
  const guardar = usarAccion(accionGuardarDiaCalendario, {
    alTerminar: () => {
      setNuevo({ dia: "", laborable: "0", nombre: "" });
      router.refresh();
    },
  });
  const cambiar = usarAccion(accionGuardarDiaCalendario, refrescar);
  const quitar = usarAccion(accionQuitarDiaCalendario, refrescar);
  const [nuevo, setNuevo] = useState({ dia: "", laborable: "0", nombre: "" });

  const porAnio = new Map<string, Dia[]>();
  for (const d of dias) {
    const a = d.dia.slice(0, 4);
    porAnio.set(a, [...(porAnio.get(a) ?? []), d]);
  }
  const error = cambiar.error ?? quitar.error;

  return (
    <>
      <Seccion titulo="Agregar o cambiar un día">
        <form
          className="grid gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.enviar(datos(nuevo));
          }}
        >
          <Campo etiqueta="Día">
            <Entrada type="date" required value={nuevo.dia} onChange={(e) => setNuevo({ ...nuevo, dia: e.target.value })} />
          </Campo>
          <Campo etiqueta="Ese día">
            <Selector value={nuevo.laborable} onChange={(e) => setNuevo({ ...nuevo, laborable: e.target.value })}>
              <option value="0">No se trabaja</option>
              <option value="1">Se trabaja</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Motivo (opcional)">
            <Entrada
              value={nuevo.nombre}
              placeholder="Ej: vacaciones, sábado con pedido"
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
          </Campo>
          <Boton type="submit" disabled={guardar.cargando || !nuevo.dia}>
            {guardar.cargando ? "Guardando…" : "Guardar"}
          </Boton>
        </form>
        {guardar.error && (
          <div className="mt-2">
            <Aviso tono="error">{guardar.error}</Aviso>
          </div>
        )}
      </Seccion>

      {error && (
        <div className="mb-3">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}

      {[...porAnio].map(([anio, lista]) => (
        <Seccion key={anio} titulo={anio} cantidad={lista.length}>
          <ul className="space-y-2">
            {lista.map((d) => {
              const pasado = d.dia < hoy;
              const finde = esFinDeSemana(d.dia);
              return (
                <li
                  key={d.dia}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${pasado ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold capitalize text-slate-900">{nombreDia(d.dia)}</div>
                    {d.nombre && <div className="text-sm text-slate-600">{d.nombre}</div>}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      d.laborable ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {d.laborable ? "Se trabaja" : "No se trabaja"}
                  </span>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Boton
                      tono="neutro"
                      className="min-h-11 flex-1 text-sm sm:flex-none"
                      disabled={cambiar.cargando}
                      onClick={() => cambiar.enviar(datos({ dia: d.dia, laborable: d.laborable ? "0" : "1" }))}
                    >
                      {d.laborable ? "Marcar que no se trabaja" : "Marcar que se trabaja"}
                    </Boton>
                    <Boton
                      tono="fantasma"
                      className="min-h-11 text-sm"
                      disabled={quitar.cargando}
                      onClick={() => {
                        const queda = finde ? "no se trabaja (fin de semana)" : "se trabaja (día de semana)";
                        if (confirm(`¿Quitar el ${nombreDia(d.dia)}? Vuelve a la regla: ${queda}.`)) {
                          quitar.enviar(datos({ dia: d.dia }));
                        }
                      }}
                    >
                      Quitar
                    </Boton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Seccion>
      ))}
    </>
  );
}
