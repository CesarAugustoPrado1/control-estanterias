"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionEmpaquetar } from "@/lib/acciones/flujo";
import type { MotivoRotura, Tanda } from "@/lib/db/schema";
import { convertir } from "@/lib/estados";
import { haceCuanto, numero } from "@/lib/formato";
import { usarAccion } from "@/components/usar-accion";
import {
  Aviso,
  Boton,
  Campo,
  Entrada,
  MarcaRehornear,
  Selector,
  Vacio,
  DetalleTecnico,
} from "@/components/ui";

/** El tunel se lee del producto en vivo: no entra en el calculo de rotura. */
type TandaEmpaque = Tanda & { requiereTunel: boolean };

export function PanelEmpaque({
  tandas,
  motivos,
}: {
  tandas: TandaEmpaque[];
  motivos: MotivoRotura[];
}) {
  const [abierta, setAbierta] = useState<number | null>(null);

  if (!tandas.length) {
    return <Vacio>No hay tandas esperando empaque.</Vacio>;
  }

  return (
    <ul className="space-y-3">
      {tandas.map((t) => (
        <li key={t.id}>
          <Fila
            tanda={t}
            motivos={motivos}
            abierta={abierta === t.id}
            alAbrir={() => setAbierta(abierta === t.id ? null : t.id)}
            alCerrar={() => setAbierta(null)}
          />
        </li>
      ))}
    </ul>
  );
}

function Fila({
  tanda,
  motivos,
  abierta,
  alAbrir,
  alCerrar,
}: {
  tanda: TandaEmpaque;
  motivos: MotivoRotura[];
  abierta: boolean;
  alAbrir: () => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const previsto = convertir(
    tanda.moldesLlenados,
    tanda.piezasPorMolde,
    tanda.piezasPorPaquete,
  );
  const [paquetes, setPaquetes] = useState(String(previsto.paquetes));
  const [motivoId, setMotivoId] = useState("");
  const [nota, setNota] = useState("");

  const { enviar, cargando, error, reintentando, detalle } = usarAccion(
    accionEmpaquetar,
    {
      alTerminar: () => {
        alCerrar();
        router.refresh();
      },
    },
  );

  const n = Number(paquetes);
  const valido = Number.isInteger(n) && n >= 0 && n <= previsto.paquetes;
  const rotos = valido ? previsto.paquetes - n : 0;
  const m2 =
    valido && tanda.m2PorPaquete ? n * Number(tanda.m2PorPaquete) : null;

  return (
    <div
      className={`rounded-xl bg-white shadow-sm ring-1 transition-colors ${
        abierta ? "ring-2 ring-blue-600" : "ring-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={alAbrir}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cifra font-bold text-slate-900">{tanda.codigo}</span>
            {tanda.rehornear && <MarcaRehornear />}
            {!tanda.piezasPorPaquete || tanda.piezasPorPaquete === 1 ? null : (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                {tanda.piezasPorPaquete} piezas por paquete
              </span>
            )}
          </div>
          <div className="truncate text-sm text-slate-700">
            {tanda.productoNombre}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {numero(tanda.moldesLlenados)} moldes · esperando{" "}
            {haceCuanto(tanda.estadoDesde)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="cifra text-2xl font-bold text-slate-900">
            {previsto.paquetes}
          </div>
          <div className="text-xs text-slate-500">previstos</div>
        </div>
      </button>

      {abierta && (
        <form
          action={(fd) => {
            fd.set("tandaId", String(tanda.id));
            enviar(fd);
          }}
          className="space-y-4 border-t border-slate-100 p-4"
        >
          {previsto.sueltas > 0 && (
            <Aviso tono="atencion">
              De {tanda.moldesLlenados} moldes salen {previsto.piezas} piezas, y
              este producto lleva {tanda.piezasPorPaquete} por paquete: queda{" "}
              {previsto.sueltas} pieza suelta sin par.
            </Aviso>
          )}

          <Campo
            etiqueta="Paquetes que salieron"
            ayuda="Este número es el único conteo del sistema. La rotura sale de compararlo con lo que se llenó."
          >
            <Entrada
              name="paquetes"
              inputMode="numeric"
              pattern="\d*"
              value={paquetes}
              onChange={(e) => setPaquetes(e.target.value.replace(/\D/g, ""))}
              required
              className="cifra text-2xl font-bold"
            />
          </Campo>

          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((menos) => {
              const v = previsto.paquetes - menos;
              if (v < 0) return null;
              const activo = n === v;
              return (
                <button
                  key={menos}
                  type="button"
                  onClick={() => setPaquetes(String(v))}
                  className={`cifra min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${
                    activo
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {menos === 0 ? `Todos (${v})` : `−${menos} (${v})`}
                </button>
              );
            })}
          </div>

          {valido && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                rotos > 0
                  ? "bg-red-50 text-red-900 ring-red-200"
                  : "bg-emerald-50 text-emerald-900 ring-emerald-200"
              }`}
            >
              {rotos > 0 ? (
                <>
                  Rotura: <strong className="cifra">{rotos}</strong> paquete
                  {rotos > 1 ? "s" : ""} respecto de los {previsto.paquetes} que
                  salían de {tanda.moldesLlenados} moldes.
                </>
              ) : (
                <>Sin rotura.</>
              )}
              {m2 !== null && <> · {numero(m2, 1)} m² terminados.</>}
            </div>
          )}

          {rotos > 0 && (
            <Campo etiqueta="Motivo de la rotura">
              <Selector
                name="motivoRoturaId"
                value={motivoId}
                onChange={(e) => setMotivoId(e.target.value)}
                required
              >
                <option value="">Elegí un motivo…</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          )}

          <Campo etiqueta="Nota (opcional)">
            <Entrada
              name="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </Campo>

          {!valido && paquetes !== "" && (
            <Aviso tono="error">
              De {tanda.moldesLlenados} moldes salen como máximo{" "}
              {previsto.paquetes} paquetes.
            </Aviso>
          )}
          {error && (
            <>
              <Aviso tono="error">{error}</Aviso>
              <DetalleTecnico texto={detalle} />
            </>
          )}
          {reintentando > 0 && (
            <Aviso tono="atencion">
              Sin respuesta, reintentando ({reintentando}/3)…
            </Aviso>
          )}

          <div className="flex gap-2">
            <Boton
              type="submit"
              disabled={cargando || !valido || (rotos > 0 && !motivoId)}
            >
              {cargando
                ? "Guardando…"
                : tanda.requiereTunel
                  ? "Empaquetar y cerrar"
                  : "Contar y cerrar"}
            </Boton>
            <Boton type="button" tono="fantasma" onClick={alCerrar}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
