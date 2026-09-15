"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  accionEntrarHorno,
  accionFraguadoNatural,
  accionSalirHorno,
} from "@/lib/acciones/flujo";
import type { Tanda } from "@/lib/db/schema";
import { ETIQUETA_MOTIVO_FRAGUADO } from "@/lib/estados";
import { duracion, desde } from "@/lib/formato";
import { SelectorTandas } from "@/components/selector-tandas";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Seccion, Selector } from "@/components/ui";

function conIds(ids: number[]): FormData {
  const fd = new FormData();
  for (const id of ids) fd.append("tandas", String(id));
  return fd;
}

export function PanelHorno({
  enPatio,
  adentro,
  cupo,
  libres,
}: {
  enPatio: Tanda[];
  adentro: Tanda[];
  cupo: number;
  libres: number;
}) {
  const router = useRouter();
  const [mostrarFraguado, setMostrarFraguado] = useState(false);
  const [motivo, setMotivo] = useState<"horno_lleno" | "clima" | "otro">(
    libres === 0 ? "horno_lleno" : "clima",
  );
  const [nota, setNota] = useState("");
  const refrescar = () => router.refresh();

  const entrar = usarAccion(accionEntrarHorno, { alTerminar: refrescar });
  const salir = usarAccion(accionSalirHorno, { alTerminar: refrescar });
  const fraguar = usarAccion(accionFraguadoNatural, {
    alTerminar: () => {
      setMostrarFraguado(false);
      setNota("");
      refrescar();
    },
  });

  const error = entrar.error ?? salir.error ?? fraguar.error;
  const cargando = entrar.cargando || salir.cargando || fraguar.cargando;

  return (
    <>
      {error && (
        <div className="mb-4">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}

      <Seccion
        titulo="Adentro del horno"
        cantidad={adentro.length}
        ayuda={`${libres} de ${cupo} lugares libres. Elegí cuáles sacás: no hace falta sacar todo junto.`}
      >
        <SelectorTandas
          tandas={adentro}
          vacio="El horno está vacío."
          detalle={(t) => (
            <div className="mt-1 text-xs font-medium text-orange-700">
              {duracion(desde(t.estadoDesde))} adentro
            </div>
          )}
          acciones={(ids, limpiar) => (
            <Boton
              type="button"
              disabled={cargando}
              onClick={() => {
                salir.enviar(conIds(ids));
                limpiar();
              }}
            >
              Sacar del horno ({ids.length})
            </Boton>
          )}
        />
      </Seccion>

      <Seccion
        titulo="En el patio, esperando horno"
        cantidad={enPatio.length}
        ayuda="Lo más viejo primero. Las marcadas REHORNEAR vienen demoradas y van antes que todo."
      >
        <SelectorTandas
          tandas={enPatio}
          vacio="No hay nada esperando en el patio."
          acciones={(ids, limpiar) => (
            <>
              <Boton
                type="button"
                disabled={cargando || ids.length > libres}
                onClick={() => {
                  entrar.enviar(conIds(ids));
                  limpiar();
                }}
                title={
                  ids.length > libres
                    ? `Solo quedan ${libres} lugares en el horno`
                    : undefined
                }
              >
                Meter al horno ({ids.length})
              </Boton>
              <Boton
                type="button"
                tono="neutro"
                disabled={cargando}
                onClick={() => setMostrarFraguado(true)}
              >
                Fraguado natural
              </Boton>

              {mostrarFraguado && (
                <div className="w-full space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <Campo
                    etiqueta="¿Por qué se saltea el horno?"
                    ayuda="Es obligatorio: 'horno lleno' es capacidad perdida y 'clima' es ahorro. Si se mezclan, el número no sirve para decidir nada."
                  >
                    <Selector
                      value={motivo}
                      onChange={(e) =>
                        setMotivo(e.target.value as typeof motivo)
                      }
                    >
                      {(["horno_lleno", "clima", "otro"] as const).map((m) => (
                        <option key={m} value={m}>
                          {ETIQUETA_MOTIVO_FRAGUADO[m]}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  {motivo === "otro" && (
                    <Campo etiqueta="Detalle">
                      <Entrada
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Qué pasó"
                      />
                    </Campo>
                  )}
                  <div className="flex gap-2">
                    <Boton
                      type="button"
                      disabled={cargando}
                      onClick={() => {
                        const fd = conIds(ids);
                        fd.set("motivo", motivo);
                        fd.set("nota", nota);
                        fraguar.enviar(fd);
                        limpiar();
                      }}
                    >
                      Confirmar ({ids.length})
                    </Boton>
                    <Boton
                      type="button"
                      tono="fantasma"
                      onClick={() => setMostrarFraguado(false)}
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
