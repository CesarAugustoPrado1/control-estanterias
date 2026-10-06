"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { accionLlenar, accionTarjetaNoEncontrada } from "@/lib/acciones/flujo";
import type { Arido, Cemento, Trompo } from "@/lib/db/schema";
import { convertir, TIPO_TROMPO } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { DIA_DE_LETRA, ETIQUETA_ARIDO, ETIQUETA_CEMENTO, type Letra } from "@/lib/tarjetas";
import { usarAccion } from "@/components/usar-accion";
import { ChipCemento, LetraDia, Placa } from "@/components/tanda";
import {
  Aviso,
  Boton,
  Campo,
  DetalleTecnico,
  Entrada,
  Tarjeta,
} from "@/components/ui";

type EstanteriaDelProducto = {
  id: number;
  etiqueta: string;
  numero: number | null;
  moldes: number;
  ocupadaPor: string | null;
};

type Producto = {
  id: number;
  nombre: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
  arido: Arido;
  piezasPorMolde: number;
  piezasPorPaquete: number;
  m2PorPaquete: string | null;
  estanterias: EstanteriaDelProducto[];
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

/** Sin acentos ni mayusculas, para que "uhma beig" encuentre "Uhma Beige". */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Orden de la pantalla, a pedido de planta: cemento, producto, estanteria,
 * trompo y moldes.
 *
 * El cemento va primero y viene en GRIS, que es lo comun: si nadie toca nada,
 * se produce gris. Tildar blanco cambia la lista de productos y de estanterias,
 * asi que la pantalla nunca ofrece una estanteria de un cemento distinto del
 * elegido. La verificacion de la placa ANTES de volcar sigue (ARQUITECTURA.md
 * §10.5): al elegir la estanteria se muestra en grande con su cemento.
 */
export function PanelTrompo({
  productos,
  ultimoCemento,
  trompoDefecto,
}: {
  productos: Producto[];
  ultimoCemento: Record<Trompo, Cemento | null>;
  trompoDefecto: Trompo;
}) {
  const router = useRouter();
  const [cemento, setCemento] = useState<Cemento>("gris");
  const [busqueda, setBusqueda] = useState("");
  const [productoId, setProductoId] = useState<number | null>(null);
  const [estanteriaId, setEstanteriaId] = useState<number | null>(null);
  const [trompo, setTrompo] = useState<Trompo>(trompoDefecto);
  const [lavado, setLavado] = useState(false);
  const [moldes, setMoldes] = useState("");
  const [hecho, setHecho] = useState<Resultado | null>(null);

  const delCemento = useMemo(() => productos.filter((p) => p.cemento === cemento), [productos, cemento]);

  // Cada palabra escrita tiene que aparecer en el nombre, el modelo o la
  // familia, en cualquier orden: "beige uhma" encuentra lo mismo que "uhma beige".
  const encontrados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return delCemento.filter((p) => {
      const texto = normalizar(`${p.nombre} ${p.modelo} ${p.familia}`);
      return palabras.every((w) => texto.includes(w));
    });
  }, [delCemento, busqueda]);

  const prod = delCemento.find((p) => p.id === productoId) ?? null;
  const est = prod?.estanterias.find((e) => e.id === estanteriaId) ?? null;
  const libres = prod ? prod.estanterias.filter((e) => !e.ocupadaPor) : [];

  useEffect(() => {
    setMoldes(est ? String(est.moldes) : "");
  }, [est]);

  const cambiaCemento = ultimoCemento[trompo] !== null && ultimoCemento[trompo] !== cemento;

  useEffect(() => setLavado(false), [trompo, cemento]);

  const elegirCemento = (c: Cemento) => {
    llenar.limpiar();
    setCemento(c);
    setProductoId(null);
    setEstanteriaId(null);
    setBusqueda("");
  };

  const elegirProducto = (p: Producto) => {
    llenar.limpiar();
    setProductoId(p.id);
    setEstanteriaId(null);
    setBusqueda("");
  };

  const reiniciar = () => {
    setCemento("gris");
    setBusqueda("");
    setProductoId(null);
    setEstanteriaId(null);
    setTrompo(trompoDefecto);
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

  const listo = prod !== null && est !== null && !est.ocupadaPor && moldes !== "" && (!cambiaCemento || lavado);

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
            fd.set("trompo", trompo);
            fd.set("confirmoLavado", lavado ? "true" : "false");
            llenar.enviar(fd);
          }}
          className="space-y-6"
        >
          {/* 1. Cemento */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">1. Cemento</h2>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl p-4 ${
                cemento === "blanco" ? "border-4 border-slate-900 bg-white" : "bg-slate-100 ring-1 ring-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={cemento === "blanco"}
                onChange={(e) => elegirCemento(e.target.checked ? "blanco" : "gris")}
                className="h-7 w-7 shrink-0 rounded border-slate-400"
              />
              <span>
                <span className="block text-lg font-bold text-slate-900">Cemento blanco</span>
                <span className="text-sm text-slate-600">
                  {cemento === "blanco"
                    ? "Se va a producir con CEMENTO BLANCO."
                    : "Sin tildar se produce con cemento gris."}
                </span>
              </span>
              <span className="ml-auto">
                <ChipCemento cemento={cemento} grande />
              </span>
            </label>
          </div>

          {/* 2. Producto */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">2. Producto</h2>
            {prod ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900">{prod.nombre}</div>
                  <div className="text-sm text-slate-600">
                    {prod.modelo} · {prod.familia} · {ETIQUETA_ARIDO[prod.arido]}
                  </div>
                </div>
                <Boton
                  type="button"
                  tono="neutro"
                  onClick={() => {
                    llenar.limpiar();
                    setProductoId(null);
                    setEstanteriaId(null);
                  }}
                >
                  Cambiar
                </Boton>
              </div>
            ) : (
              <div className="space-y-2">
                <Entrada
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Escribí el modelo o el nombre…"
                  autoComplete="off"
                  className="text-lg"
                />
                {busqueda.trim() !== "" &&
                  (encontrados.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
                      Ningún producto de {ETIQUETA_CEMENTO[cemento]} coincide con “{busqueda.trim()}”.
                      {cemento === "gris" && " Si es de cemento blanco, tildalo arriba."}
                    </p>
                  ) : (
                    <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
                      {encontrados.map((p) => {
                        const lib = p.estanterias.filter((e) => !e.ocupadaPor).length;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => elegirProducto(p)}
                              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50"
                            >
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-900">{p.nombre}</span>
                                <span className="block text-xs text-slate-500">
                                  {p.modelo} · {p.familia} · {ETIQUETA_ARIDO[p.arido]}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 text-xs font-semibold ${lib === 0 ? "text-amber-700" : "text-emerald-700"}`}
                              >
                                {p.estanterias.length === 0
                                  ? "sin estanterías"
                                  : `${lib} libre${lib === 1 ? "" : "s"}`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
              </div>
            )}
          </div>

          {/* 3. Estanteria */}
          {prod && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">3. Estantería</h2>
              {prod.estanterias.length === 0 ? (
                <Aviso tono="atencion">
                  No hay estanterías cargadas para {prod.modelo} · {prod.familia} · {ETIQUETA_CEMENTO[prod.cemento]}.
                  Pedile al administrador que las cargue.
                </Aviso>
              ) : (
                <>
                  {libres.length === 0 && (
                    <Aviso tono="atencion">
                      Todas las estanterías de {prod.modelo} · {prod.familia} están llenas. Se liberan al desmoldarse.
                    </Aviso>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {prod.estanterias.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        disabled={!!e.ocupadaPor}
                        onClick={() => {
                          llenar.limpiar();
                          setEstanteriaId(e.id);
                        }}
                        className={`min-h-16 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          estanteriaId === e.id
                            ? "bg-blue-700 text-white"
                            : "bg-white text-slate-800 ring-1 ring-slate-300"
                        }`}
                      >
                        <span className="cifra block text-xl font-bold">
                          N.º {String(e.numero ?? "?").padStart(2, "0")}
                        </span>
                        <span className="block text-xs">
                          {e.ocupadaPor ? `llena (${e.ocupadaPor})` : `${e.moldes} moldes`}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {est && (
                <div
                  className={`rounded-xl p-4 ${
                    prod.cemento === "blanco"
                      ? "border-4 border-slate-900 bg-white"
                      : "bg-slate-100 ring-1 ring-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Placa etiqueta={est.etiqueta} grande />
                    <ChipCemento cemento={prod.cemento} grande />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {est.moldes} moldes · Verificá que la placa y los laterales coincidan{" "}
                    <strong>antes de volcar</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 4. Trompo */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">4. Trompo</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrompo(t)}
                  className={`min-h-16 rounded-lg transition-colors ${
                    trompo === t ? "bg-blue-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  <span className="block text-lg font-bold">Trompo {t.toUpperCase()}</span>
                  <span className="block text-sm capitalize">{TIPO_TROMPO[t]}</span>
                </button>
              ))}
            </div>

            {cambiaCemento && (
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
                  Ahora va {ETIQUETA_CEMENTO[cemento]}. Tildá solo si ya se lavó.
                </span>
              </label>
            )}
          </div>

          {/* 5. Moldes */}
          {prod && est && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">5. Moldes llenados</h2>
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

              {previsto && (
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
