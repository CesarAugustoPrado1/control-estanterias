"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { accionLlenar, accionTarjetaNoEncontrada } from "@/lib/acciones/flujo";
import type { Cemento, Trompo } from "@/lib/db/schema";
import { convertir } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { DIA_DE_LETRA, ETIQUETA_CEMENTO, type Letra } from "@/lib/tarjetas";
import { usarAccion } from "@/components/usar-accion";
import { ChipCemento, LetraDia, Placa } from "@/components/tanda";
import {
  Aviso,
  Boton,
  Campo,
  DetalleTecnico,
  Entrada,
  Selector,
  Tarjeta,
} from "@/components/ui";

type Producto = {
  id: number;
  nombre: string;
  piezasPorMolde: number;
  piezasPorPaquete: number;
  m2PorPaquete: string | null;
};

type Estanteria = {
  id: number;
  etiqueta: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
  numero: number | null;
  moldes: number;
  ocupadaPor: string | null;
  productos: Producto[];
};

type Resultado = {
  tandaId: number;
  codigo: string;
  etiqueta: string;
  moldes: number;
  palabra: string | null;
  letra: Letra;
  orden: number | null;
  dia: string;
};

/**
 * Orden de la pantalla = orden del trabajo en el piso (ARQUITECTURA.md §10.7):
 * primero se identifica la estanteria por su placa, ANTES de volcar, porque el
 * error mas caro -mezcla gris en moldes de blanco- no se arregla despues.
 */
export function PanelTrompo({
  estanterias,
  ultimoCemento,
}: {
  estanterias: Estanteria[];
  ultimoCemento: Record<Trompo, Cemento | null>;
}) {
  const router = useRouter();
  const [modelo, setModelo] = useState("");
  const [estanteriaId, setEstanteriaId] = useState<number | null>(null);
  const [trompo, setTrompo] = useState<Trompo | null>(null);
  const [lavado, setLavado] = useState(false);
  const [productoId, setProductoId] = useState<number | null>(null);
  const [moldes, setMoldes] = useState("");
  const [hecho, setHecho] = useState<Resultado | null>(null);

  const modelos = useMemo(
    () => [...new Set(estanterias.map((e) => e.modelo))],
    [estanterias],
  );
  const delModelo = estanterias.filter((e) => e.modelo === modelo);
  const est = estanterias.find((e) => e.id === estanteriaId) ?? null;
  const prod = est?.productos.find((p) => p.id === productoId) ?? null;

  // Si la estanteria admite un solo tono, no hay nada que elegir. El riesgo que
  // cubria "no preseleccionar el producto" ahora lo cubre la placa.
  useEffect(() => {
    setProductoId(est && est.productos.length === 1 ? est.productos[0].id : null);
    setMoldes(est ? String(est.moldes) : "");
  }, [est]);

  const cambiaCemento =
    est !== null && trompo !== null && ultimoCemento[trompo] !== null && ultimoCemento[trompo] !== est.cemento;

  useEffect(() => setLavado(false), [trompo, estanteriaId]);

  const reiniciar = () => {
    setModelo("");
    setEstanteriaId(null);
    setTrompo(null);
    setProductoId(null);
    setMoldes("");
  };

  const llenar = usarAccion(accionLlenar, {
    alTerminar: (r) => {
      setHecho(r);
      reiniciar();
      router.refresh();
    },
  });
  const noEncuentro = usarAccion(accionTarjetaNoEncontrada, {
    alTerminar: (r) => {
      setHecho((h) => (h ? { ...h, palabra: r.palabra, orden: r.orden } : h));
      router.refresh();
    },
  });

  const n = Number(moldes);
  const previsto =
    prod && Number.isInteger(n) && n > 0 ? convertir(n, prod.piezasPorMolde, prod.piezasPorPaquete) : null;
  const m2 = previsto && prod?.m2PorPaquete ? previsto.paquetes * Number(prod.m2PorPaquete) : null;

  const listo =
    est !== null && !est.ocupadaPor && trompo !== null && prod !== null && moldes !== "" && (!cambiaCemento || lavado);

  return (
    <div className="space-y-4">
      {hecho && (
        <TarjetaAsignada
          r={hecho}
          cargando={noEncuentro.cargando}
          error={noEncuentro.error}
          alNoEncontrar={() => {
            const fd = new FormData();
            fd.set("tandaId", String(hecho.tandaId));
            noEncuentro.enviar(fd);
          }}
          alCerrar={() => setHecho(null)}
        />
      )}

      <Tarjeta>
        <form
          action={(fd) => {
            setHecho(null);
            fd.set("estanteriaId", String(estanteriaId ?? ""));
            fd.set("productoId", String(productoId ?? ""));
            fd.set("trompo", trompo ?? "");
            fd.set("confirmoLavado", lavado ? "true" : "false");
            llenar.enviar(fd);
          }}
          className="space-y-5"
        >
          {/* 1. La estanteria, por su placa */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">1. ¿Qué estantería tenés adelante?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Modelo">
                <Selector
                  value={modelo}
                  onChange={(e) => {
                    llenar.limpiar();
                    setModelo(e.target.value);
                    setEstanteriaId(null);
                  }}
                >
                  <option value="">Elegí el modelo…</option>
                  {modelos.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Placa" ayuda="Lo que dice la placa: familia y número.">
                <Selector
                  value={estanteriaId ?? ""}
                  disabled={!modelo}
                  onChange={(e) => {
                    llenar.limpiar();
                    setEstanteriaId(e.target.value ? Number(e.target.value) : null);
                  }}
                >
                  <option value="">{modelo ? "Elegí la placa…" : "Primero el modelo"}</option>
                  {delModelo.map((e) => (
                    <option key={e.id} value={e.id} disabled={!!e.ocupadaPor}>
                      {e.familia} · {String(e.numero ?? "?").padStart(2, "0")}
                      {e.cemento === "blanco" ? " · CEMENTO BLANCO" : ""}
                      {e.ocupadaPor ? ` — llena (${e.ocupadaPor})` : ""}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>

            {est && (
              <div
                className={`rounded-xl p-4 ${
                  est.cemento === "blanco"
                    ? "border-4 border-slate-900 bg-white"
                    : "bg-slate-100 ring-1 ring-slate-300"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Placa etiqueta={est.etiqueta} grande />
                  <ChipCemento cemento={est.cemento} grande />
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {est.moldes} moldes · Verificá que la placa y los laterales coincidan{" "}
                  <strong>antes de volcar</strong>.
                </p>
              </div>
            )}
          </div>

          {/* 2. El trompo */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">2. Trompo</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrompo(t)}
                  className={`min-h-14 rounded-lg text-lg font-bold transition-colors ${
                    trompo === t ? "bg-blue-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  Trompo {t.toUpperCase()}
                </button>
              ))}
            </div>

            {cambiaCemento && est && trompo && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={lavado}
                  onChange={(e) => setLavado(e.target.checked)}
                  className="mt-1 h-7 w-7 shrink-0 rounded border-amber-600 text-amber-600"
                />
                <span className="text-amber-950">
                  <strong className="block text-lg">
                    El trompo {trompo.toUpperCase()} viene de {ETIQUETA_CEMENTO[ultimoCemento[trompo]!]}.
                  </strong>
                  Ahora va {ETIQUETA_CEMENTO[est.cemento]}. Tildá solo si ya se lavó.
                </span>
              </label>
            )}
          </div>

          {/* 3. Tono y moldes */}
          {est && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">3. Tono y moldes</h2>
              {est.productos.length === 0 ? (
                <Aviso tono="atencion">
                  No hay productos cargados para {est.modelo} · {est.familia} · {ETIQUETA_CEMENTO[est.cemento]}.
                  Pedile al administrador que lo cargue.
                </Aviso>
              ) : (
                <Campo etiqueta="Tono">
                  <Selector
                    value={productoId ?? ""}
                    onChange={(e) => setProductoId(e.target.value ? Number(e.target.value) : null)}
                  >
                    {est.productos.length > 1 && <option value="">Elegí el tono…</option>}
                    {est.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              )}

              <Campo
                etiqueta="Moldes llenados"
                ayuda={`La estantería tiene ${est.moldes} moldes. Si no alcanzó la mezcla, bajalo.`}
              >
                <Entrada
                  name="moldesLlenados"
                  inputMode="numeric"
                  pattern="\d*"
                  value={moldes}
                  onChange={(e) => setMoldes(e.target.value.replace(/\D/g, ""))}
                  className="cifra text-2xl font-bold"
                />
              </Campo>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((menos) => {
                  const v = est.moldes - menos;
                  if (v < 1) return null;
                  return (
                    <button
                      key={menos}
                      type="button"
                      onClick={() => setMoldes(String(v))}
                      className={`cifra min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${
                        Number(moldes) === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
                      }`}
                    >
                      {menos === 0 ? `Completa (${v})` : `−${menos} (${v})`}
                    </button>
                  );
                })}
              </div>

              {previsto && prod && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
                  Van a salir <strong className="cifra">{numero(previsto.paquetes)}</strong> paquete
                  {previsto.paquetes === 1 ? "" : "s"}
                  {m2 !== null && <> · {numero(m2, 1)} m²</>}
                  {previsto.sueltas > 0 && (
                    <div className="mt-1 text-amber-800">
                      Queda {previsto.sueltas} pieza suelta sin par: este producto lleva{" "}
                      {prod.piezasPorPaquete} piezas por paquete.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {llenar.error && (
            <>
              <Aviso tono="error">{llenar.error}</Aviso>
              <DetalleTecnico texto={llenar.detalle} />
            </>
          )}
          {llenar.reintentando > 0 && (
            <Aviso tono="atencion">Sin respuesta, reintentando ({llenar.reintentando}/3)…</Aviso>
          )}

          <Boton type="submit" ancho disabled={llenar.cargando || !listo}>
            {llenar.cargando ? "Registrando…" : "Registrar llenado"}
          </Boton>
        </form>
      </Tarjeta>
    </div>
  );
}

/**
 * Lo que el operario tiene que hacer despues de registrar: colgar la tarjeta.
 * Queda en pantalla hasta que la cierre o registre otro llenado, porque entre
 * tocar el boton y llegar al tablero pasan unos segundos y el dato no se puede
 * perder.
 */
function TarjetaAsignada({
  r,
  cargando,
  error,
  alNoEncontrar,
  alCerrar,
}: {
  r: Resultado;
  cargando: boolean;
  error: string | null;
  alNoEncontrar: () => void;
  alCerrar: () => void;
}) {
  const dia = DIA_DE_LETRA[r.letra];
  if (!r.palabra) {
    return (
      <Aviso tono="atencion">
        <strong>Llenado registrado ({r.codigo}), pero no quedan tarjetas libres del {dia.dia}.</strong>{" "}
        Escribí <strong className="cifra">{r.codigo}</strong> en una tarjeta provisoria y colgala en la
        estantería {r.etiqueta}. Avisale al administrador.
        <div className="mt-2">
          <Boton type="button" tono="neutro" onClick={alCerrar}>
            Entendido
          </Boton>
        </div>
      </Aviso>
    );
  }
  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: `${dia.hex}22`, border: `3px solid ${dia.hex}` }}>
      <div className="text-sm font-semibold text-slate-700">Llenado registrado. Colgá esta tarjeta:</div>
      <div className="mt-2 flex items-center gap-3">
        <LetraDia letra={r.letra} tamano="grande" />
        <span className="text-4xl font-black tracking-wide text-slate-900">{r.palabra.toUpperCase()}</span>
      </div>
      <p className="mt-2 text-slate-800">
        Tablero del <strong>{dia.dia}</strong> ({dia.color}), gancho <strong className="cifra">{r.orden}</strong>.
        Va en la estantería <Placa etiqueta={r.etiqueta} />.
      </p>
      {error && (
        <div className="mt-3">
          <Aviso tono="error">{error}</Aviso>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Boton type="button" onClick={alCerrar}>
          Ya la colgué
        </Boton>
        <Boton type="button" tono="neutro" disabled={cargando} onClick={alNoEncontrar}>
          {cargando ? "Buscando otra…" : "No la encuentro en el tablero"}
        </Boton>
      </div>
    </div>
  );
}
