"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  accionDesmoldar,
  accionDevolverAlHorno,
  accionNoCoincide,
} from "@/lib/acciones/flujo";
import type { Tanda } from "@/lib/db/schema";
import { duracion, desde } from "@/lib/formato";
import { SelectorTandas } from "@/components/selector-tandas";
import { ChipCemento, NombreTanda, Placa } from "@/components/tanda";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, DetalleTecnico, Entrada, Seccion } from "@/components/ui";

function conIds(ids: number[]): FormData {
  const fd = new FormData();
  for (const id of ids) fd.append("tandas", String(id));
  return fd;
}

export function PanelDesmolde({ aDesmoldar }: { aDesmoldar: Tanda[] }) {
  const router = useRouter();
  const [mostrarDevolver, setMostrarDevolver] = useState(false);
  const [nota, setNota] = useState("");
  /**
   * Tandas elegidas que esperan la verificacion de placa. El desmolde es el
   * traspaso critico -la tarjeta pasa de la estanteria al palet- y es el unico
   * momento en que una tarjeta colgada en la estanteria equivocada todavia se
   * puede detectar mirando. Despues ya esta separada de los moldes.
   */
  const [verificando, setVerificando] = useState<number[] | null>(null);
  const refrescar = () => router.refresh();

  const desmoldar = usarAccion(accionDesmoldar, {
    alTerminar: () => {
      setVerificando(null);
      refrescar();
    },
  });
  const devolver = usarAccion(accionDevolverAlHorno, {
    alTerminar: () => {
      setMostrarDevolver(false);
      setNota("");
      refrescar();
    },
  });

  const error = desmoldar.error ?? devolver.error;
  const detalle = desmoldar.detalle ?? devolver.detalle;
  const cargando = desmoldar.cargando || devolver.cargando;

  if (verificando) {
    return (
      <Verificacion
        tandas={aDesmoldar.filter((t) => verificando.includes(t.id))}
        cargando={desmoldar.cargando}
        error={desmoldar.error}
        detalle={desmoldar.detalle}
        alQuitar={(id) => setVerificando((v) => (v ? v.filter((x) => x !== id) : v))}
        alConfirmar={(ids) => desmoldar.enviar(conIds(ids))}
        alCancelar={() => setVerificando(null)}
      />
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4">
          <Aviso tono="error">{error}</Aviso>
          <DetalleTecnico texto={detalle} />
        </div>
      )}
      {desmoldar.ok !== null && desmoldar.ok > 0 && (
        <div className="mb-4">
          <Aviso tono="ok">
            {desmoldar.ok} tanda{desmoldar.ok > 1 ? "s" : ""} desmoldada{desmoldar.ok > 1 ? "s" : ""}.
            Las tarjetas van con las piezas al palet, y esas estanterías ya están libres para el
            trompo.
          </Aviso>
        </div>
      )}

      <Seccion
        titulo="Esperando desmolde"
        cantidad={aDesmoldar.length}
        ayuda="Marcá las que vas a desmoldar. Las piezas se cuentan en empaque, acá no hace falta ningún número."
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
                  setVerificando(ids);
                  limpiar();
                }}
              >
                Desmoldar ({ids.length})
              </Boton>
              <Boton type="button" tono="neutro" disabled={cargando} onClick={() => setMostrarDevolver(true)}>
                No fraguó
              </Boton>

              {mostrarDevolver && (
                <div className="w-full space-y-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                  <p className="text-sm text-amber-900">
                    Vuelve a la cola del horno marcada como <strong>REHORNEAR</strong>, primera de la
                    fila. <strong>Poné la pinza roja en la tarjeta</strong>, que sigue en la estantería.
                    Vos informás el hecho; meterla al horno es del hornero.
                  </p>
                  <Campo etiqueta="Nota (opcional)">
                    <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cómo venía" />
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
                    <Boton type="button" tono="fantasma" onClick={() => setMostrarDevolver(false)}>
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

function Verificacion({
  tandas,
  cargando,
  error,
  detalle,
  alQuitar,
  alConfirmar,
  alCancelar,
}: {
  tandas: Tanda[];
  cargando: boolean;
  error: string | null;
  detalle: string | null;
  alQuitar: (id: number) => void;
  alConfirmar: (ids: number[]) => void;
  alCancelar: () => void;
}) {
  return (
    <Seccion
      titulo="Antes de desmoldar: ¿coinciden?"
      ayuda="Mirá cada estantería: la tarjeta colgada tiene que estar en la placa que dice acá. Si alguna no coincide, avisá y no la desmoldes."
    >
      <ul className="space-y-3">
        {tandas.map((t) => (
          <FilaVerificacion key={t.id} tanda={t} alInformado={() => alQuitar(t.id)} />
        ))}
      </ul>

      {tandas.length === 0 && (
        <Aviso tono="info">No quedó ninguna para desmoldar. Las que no coincidían quedaron avisadas.</Aviso>
      )}

      {error && (
        <div className="mt-3">
          <Aviso tono="error">{error}</Aviso>
          <DetalleTecnico texto={detalle} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Boton
          type="button"
          disabled={cargando || tandas.length === 0}
          onClick={() => alConfirmar(tandas.map((t) => t.id))}
        >
          {cargando ? "Registrando…" : `Coinciden: desmoldar (${tandas.length})`}
        </Boton>
        <Boton type="button" tono="fantasma" onClick={alCancelar}>
          Volver
        </Boton>
      </div>
    </Seccion>
  );
}

function FilaVerificacion({ tanda: t, alInformado }: { tanda: Tanda; alInformado: () => void }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [placa, setPlaca] = useState("");
  const informar = usarAccion(accionNoCoincide, {
    alTerminar: () => {
      alInformado();
      router.refresh();
    },
  });

  return (
    <li className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <NombreTanda palabra={t.tarjetaPalabra} letra={t.tarjetaLetra} codigo={t.codigo} />
        <span className="text-slate-400">→</span>
        <Placa etiqueta={t.estanteriaEtiqueta} grande />
        {t.cemento === "blanco" && <ChipCemento cemento="blanco" />}
      </div>
      <div className="mt-1 text-sm text-slate-600">{t.productoNombre}</div>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-3 text-sm font-semibold text-red-700 hover:underline"
        >
          No coincide
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
          <Campo etiqueta="¿Qué dice la placa de la estantería que tiene esa tarjeta?">
            <Entrada value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="Ej: UHMA BEIGE 05" />
          </Campo>
          {informar.error && <Aviso tono="error">{informar.error}</Aviso>}
          <div className="flex gap-2">
            <Boton
              type="button"
              tono="peligro"
              disabled={informar.cargando}
              onClick={() => {
                const fd = new FormData();
                fd.set("tandaId", String(t.id));
                fd.set("placaVista", placa);
                informar.enviar(fd);
              }}
            >
              Avisar y no desmoldar
            </Boton>
            <Boton type="button" tono="fantasma" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}
