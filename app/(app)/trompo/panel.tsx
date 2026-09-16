"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { accionLlenar } from "@/lib/acciones/flujo";
import { convertir } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { usarAccion } from "@/components/usar-accion";
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
  modelo: string;
  familia: string;
  piezasPorMolde: number;
  piezasPorPaquete: number;
  m2PorPaquete: string | null;
  libres: number;
  total: number;
  moldesTipicos: number | null;
};

export function PanelTrompo({ productos }: { productos: Producto[] }) {
  const router = useRouter();
  const [productoId, setProductoId] = useState<number | null>(null);
  const [trompo, setTrompo] = useState<"a" | "b">("a");
  const [moldes, setMoldes] = useState<string>("");

  const prod = useMemo(
    () => productos.find((p) => p.id === productoId) ?? null,
    [productoId, productos],
  );

  // Al elegir producto se propone el nominal de sus estanterias. Es una
  // PROPUESTA, no un dato: el numero real lo pone el operario y es uno de los
  // dos que sostienen toda la medicion de rotura.
  useEffect(() => {
    if (prod?.moldesTipicos) setMoldes(String(prod.moldesTipicos));
  }, [prod]);

  const { enviar, cargando, error, ok, reintentando, detalle, limpiar } = usarAccion(
    accionLlenar,
    {
      alTerminar: () => {
        setProductoId(null);
        setMoldes("");
        router.refresh();
      },
    },
  );

  const n = Number(moldes);
  const previsto =
    prod && Number.isInteger(n) && n > 0
      ? convertir(n, prod.piezasPorMolde, prod.piezasPorPaquete)
      : null;
  const m2 =
    previsto && prod?.m2PorPaquete
      ? previsto.paquetes * Number(prod.m2PorPaquete)
      : null;

  const nominal = prod?.moldesTipicos ?? null;
  const sinMoldes = prod !== null && prod.libres === 0;

  return (
    <div className="space-y-4">
      {ok && (
        <Aviso tono="ok">
          <strong>Tanda {ok.codigo}</strong> registrada con {ok.moldes} moldes.
          Escribí ese código en la tarjeta y colgala del soporte.
        </Aviso>
      )}

      <Tarjeta>
        <form
          action={(fd) => {
            fd.set("trompo", trompo);
            enviar(fd);
          }}
          className="space-y-4"
        >
          <Campo
            etiqueta="Producto"
            ayuda="No viene elegido a propósito: elegirlo a mano es lo que evita cargar la tanda equivocada."
          >
            <Selector
              name="productoId"
              value={productoId ?? ""}
              onChange={(e) => {
                limpiar();
                setProductoId(e.target.value ? Number(e.target.value) : null);
              }}
              required
            >
              <option value="">Elegí un producto…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id} disabled={p.libres === 0}>
                  {p.nombre}
                  {p.libres === 0
                    ? " — sin estanterías libres"
                    : ` — ${p.libres} libre${p.libres > 1 ? "s" : ""}`}
                </option>
              ))}
            </Selector>
          </Campo>

          {sinMoldes && (
            <Aviso tono="atencion">
              No hay estanterías libres de {prod.modelo} {prod.familia}: están
              todas en el circuito. Hay que desmoldar alguna antes de llenar otra.
            </Aviso>
          )}

          <Campo etiqueta="Trompo">
            <div className="grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrompo(t)}
                  className={`min-h-12 rounded-lg text-base font-bold transition-colors ${
                    trompo === t
                      ? "bg-blue-700 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  Trompo {t.toUpperCase()}
                </button>
              ))}
            </div>
          </Campo>

          <Campo
            etiqueta="Moldes llenados"
            ayuda={
              nominal
                ? `La estantería tiene ${nominal} moldes. Si no alcanzó la mezcla, bajalo.`
                : undefined
            }
          >
            <Entrada
              name="moldesLlenados"
              inputMode="numeric"
              pattern="\d*"
              value={moldes}
              onChange={(e) => setMoldes(e.target.value.replace(/\D/g, ""))}
              required
              className="cifra text-2xl font-bold"
            />
          </Campo>

          {/* El caso tipico en un toque: casi siempre faltan uno o dos porque
              no alcanzo la mezcla. */}
          {nominal && (
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((menos) => {
                const v = nominal - menos;
                if (v < 1) return null;
                const activo = Number(moldes) === v;
                return (
                  <button
                    key={menos}
                    type="button"
                    onClick={() => setMoldes(String(v))}
                    className={`cifra min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${
                      activo
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-300"
                    }`}
                  >
                    {menos === 0 ? `Completa (${v})` : `−${menos} (${v})`}
                  </button>
                );
              })}
            </div>
          )}

          {previsto && prod && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
              Van a salir{" "}
              <strong className="cifra">{numero(previsto.paquetes)}</strong>{" "}
              paquete{previsto.paquetes === 1 ? "" : "s"}
              {m2 !== null && <> · {numero(m2, 1)} m²</>}
              {previsto.sueltas > 0 && (
                <div className="mt-1 text-amber-800">
                  Queda {previsto.sueltas} pieza suelta sin par: este producto
                  necesita {prod.piezasPorPaquete} piezas por paquete.
                </div>
              )}
            </div>
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

          <Boton
            type="submit"
            ancho
            disabled={cargando || !productoId || sinMoldes || !moldes}
          >
            {cargando ? "Registrando…" : "Registrar llenado"}
          </Boton>
        </form>
      </Tarjeta>
    </div>
  );
}
