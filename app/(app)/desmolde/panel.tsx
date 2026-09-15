"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionDesmoldar, accionDevolverAlHorno } from "@/lib/acciones/flujo";
import type { Tanda } from "@/lib/db/schema";
import { duracion, desde } from "@/lib/formato";
import { SelectorTandas } from "@/components/selector-tandas";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Seccion } from "@/components/ui";

function conIds(ids: number[]): FormData {
  const fd = new FormData();
  for (const id of ids) fd.append("tandas", String(id));
  return fd;
}

export function PanelDesmolde({ aDesmoldar }: { aDesmoldar: Tanda[] }) {
  const router = useRouter();
  const [mostrarDevolver, setMostrarDevolver] = useState(false);
  const [nota, setNota] = useState("");
  const refrescar = () => router.refresh();

  const desmoldar = usarAccion(accionDesmoldar, { alTerminar: refrescar });
  const devolver = usarAccion(accionDevolverAlHorno, {
    alTerminar: () => {
      setMostrarDevolver(false);
      setNota("");
      refrescar();
    },
  });

  const error = desmoldar.error ?? devolver.error;
  const cargando = desmoldar.cargando || devolver.cargando;

  return (
    <>
      {error && (
        <div className="mb-4">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}
      {desmoldar.ok !== null && desmoldar.ok > 0 && (
        <div className="mb-4">
          <Aviso tono="ok">
            {desmoldar.ok} tanda{desmoldar.ok > 1 ? "s" : ""} desmoldada
            {desmoldar.ok > 1 ? "s" : ""}. Esos moldes ya están libres para
            volver al trompo.
          </Aviso>
        </div>
      )}

      <Seccion
        titulo="Esperando desmolde"
        cantidad={aDesmoldar.length}
        ayuda="Marcá las que desmoldaste. Las piezas se cuentan en empaque, acá no hace falta ningún número."
      >
        <SelectorTandas
          tandas={aDesmoldar}
          vacio="No hay nada esperando desmolde."
          detalle={(t) => (
            <div className="mt-1 text-xs font-medium text-amber-700">
              esperando {duracion(desde(t.estadoDesde))}
            </div>
          )}
          acciones={(ids, limpiar) => (
            <>
              <Boton
                type="button"
                disabled={cargando}
                onClick={() => {
                  desmoldar.enviar(conIds(ids));
                  limpiar();
                }}
              >
                Desmoldar ({ids.length})
              </Boton>
              <Boton
                type="button"
                tono="neutro"
                disabled={cargando}
                onClick={() => setMostrarDevolver(true)}
              >
                No fraguó
              </Boton>

              {mostrarDevolver && (
                <div className="w-full space-y-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                  <p className="text-sm text-amber-900">
                    Vuelve a la cola del horno marcada como <strong>REHORNEAR</strong>,
                    primera de la fila. Vos informás el hecho; meterla al horno
                    es del hornero.
                  </p>
                  <Campo etiqueta="Nota (opcional)">
                    <Entrada
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      placeholder="Cómo venía"
                    />
                  </Campo>
                  <div className="flex gap-2">
                    <Boton
                      type="button"
                      disabled={cargando}
                      onClick={() => {
                        const fd = conIds(ids);
                        fd.set("nota", nota);
                        devolver.enviar(fd);
                        limpiar();
                      }}
                    >
                      Devolver al horno ({ids.length})
                    </Boton>
                    <Boton
                      type="button"
                      tono="fantasma"
                      onClick={() => setMostrarDevolver(false)}
                    >
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}
            </>
          )}
        />
      </Seccion>
    </>
  );
}
