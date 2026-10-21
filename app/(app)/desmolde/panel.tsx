"use client";

import type { Tono } from "@/lib/escala";
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
import { ChipCemento, NombreTanda, Placa, Relativo } from "@/components/tanda";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, DetalleTecnico, Entrada, Seccion, Selector } from "@/components/ui";

type Persona = { id: number; nombre: string };

function conIds(ids: number[]): FormData {
  const fd = new FormData();
  for (const id of ids) fd.append("tandas", String(id));
  return fd;
}

export function PanelDesmolde({
  aDesmoldar,
  desmoldadores,
  tono,
}: {
  aDesmoldar: Tanda[];
  desmoldadores: Persona[];
  /** Color de la escala de la pantalla (lib/escala.ts). */
  tono?: Tono;
}) {
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
        tono={tono}
        tandas={aDesmoldar.filter((t) => verificando.includes(t.id))}
        desmoldadores={desmoldadores}
        cargando={desmoldar.cargando}
        error={desmoldar.error}
        detalle={desmoldar.detalle}
        alQuitar={(id) => setVerificando((v) => (v ? v.filter((x) => x !== id) : v))}
        alConfirmar={(quien) => {
          const fd = conIds([...quien.keys()]);
          for (const [id, persona] of quien) fd.set(`desmoldador_${id}`, String(persona));
          desmoldar.enviar(fd);
        }}
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
            {desmoldar.ok} maquinada{desmoldar.ok > 1 ? "s" : ""} desmoldada{desmoldar.ok > 1 ? "s" : ""}.
            Las tarjetas van con las piezas al palet, y esas estanterías ya están libres para el
            trompo.
          </Aviso>
        </div>
      )}

      <Seccion
        tono={tono}
        titulo="Esperando desmolde"
        cantidad={aDesmoldar.length}
        ayuda="Marcá las que vas a desmoldar. Las piezas se cuentan en empaque, acá no hace falta ningún número."
      >
        <SelectorTandas
          tandas={aDesmoldar}
          vacio="No hay nada esperando desmolde."
          detalle={(t) => (
            <div className="mt-1 text-xs font-medium text-amber-700">
              esperando <Relativo>{duracion(desde(t.estadoDesde))}</Relativo>
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
  tono,
  tandas,
  desmoldadores,
  cargando,
  error,
  detalle,
  alQuitar,
  alConfirmar,
  alCancelar,
}: {
  tono?: Tono;
  tandas: Tanda[];
  desmoldadores: Persona[];
  cargando: boolean;
  error: string | null;
  detalle: string | null;
  alQuitar: (id: number) => void;
  /** Id de tanda -> id de quien la desmoldo. */
  alConfirmar: (quien: Map<number, number>) => void;
  alCancelar: () => void;
}) {
  // Cada maquinada la desmolda una persona, y rotan: se elige en cada fila.
  const [quien, setQuien] = useState<Record<number, string>>({});
  const faltan = tandas.filter((t) => !desmoldadores.some((d) => String(d.id) === quien[t.id])).length;

  return (
    <Seccion
      tono={tono}
      titulo="Antes de desmoldar: ¿coinciden?"
      ayuda="Mirá cada estantería: la tarjeta colgada tiene que estar en la placa que dice acá. Si alguna no coincide, avisá y no la desmoldes."
    >
      <ul className="space-y-3">
        {tandas.map((t) => (
          <FilaVerificacion
            key={t.id}
            tanda={t}
            desmoldadores={desmoldadores}
            desmoldador={quien[t.id] ?? ""}
            alElegir={(v) => setQuien((q) => ({ ...q, [t.id]: v }))}
            alInformado={() => alQuitar(t.id)}
          />
        ))}
      </ul>

      {desmoldadores.length === 0 && (
        <Aviso tono="atencion">
          No hay desmoldadores activos cargados. Pedile al administrador que los cargue en Parámetros
          (es la misma lista de maquinistas).
        </Aviso>
      )}

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
          disabled={cargando || tandas.length === 0 || faltan > 0}
          onClick={() => alConfirmar(new Map(tandas.map((t) => [t.id, Number(quien[t.id])])))}
        >
          {cargando
            ? "Registrando…"
            : faltan > 0
              ? `Falta elegir el desmoldador (${faltan})`
              : `Coinciden: desmoldar (${tandas.length})`}
        </Boton>
        <Boton type="button" tono="fantasma" onClick={alCancelar}>
          Volver
        </Boton>
      </div>
    </Seccion>
  );
}

function FilaVerificacion({
  tanda: t,
  desmoldadores,
  desmoldador,
  alElegir,
  alInformado,
}: {
  tanda: Tanda;
  desmoldadores: Persona[];
  desmoldador: string;
  alElegir: (id: string) => void;
  alInformado: () => void;
}) {
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

      {desmoldadores.length > 0 && (
        <div className="mt-3">
          <Campo etiqueta="Desmoldador">
            <Selector value={desmoldador} onChange={(e) => alElegir(e.target.value)}>
              <option value="">¿Quién la desmolda?</option>
              {desmoldadores.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
      )}

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
