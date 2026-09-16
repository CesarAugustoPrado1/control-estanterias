"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  analizarPlanilla,
  importarPlanilla,
  type Accion,
  type Analisis,
} from "@/lib/acciones/planillas";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { claseInput } from "@/components/ui";

const COLOR: Record<Accion, string> = {
  crear: "bg-emerald-100 text-emerald-800",
  actualizar: "bg-blue-100 text-blue-800",
  "sin cambios": "bg-slate-100 text-slate-600",
  error: "bg-red-100 text-red-800",
};

export function PanelPlanilla() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Analisis | null>(null);
  const [aplicado, setAplicado] = useState<Analisis | null>(null);

  const analisis = usarAccion(analizarPlanilla, {
    alTerminar: (a) => {
      setVista(a);
      setAplicado(null);
    },
  });
  const importacion = usarAccion(importarPlanilla, {
    alTerminar: (a) => {
      setAplicado(a);
      setVista(null);
      setArchivo(null);
      if (input.current) input.current.value = "";
      router.refresh();
    },
  });

  const conArchivo = () => {
    const fd = new FormData();
    if (archivo) fd.set("archivo", archivo);
    return fd;
  };

  const error = analisis.error ?? importacion.error;
  const cargando = analisis.cargando || importacion.cargando;

  return (
    <div className="space-y-4">
      <Tarjeta>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Archivo .xlsx
            </span>
            <input
              ref={input}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setVista(null);
                setAplicado(null);
                analisis.limpiar();
                importacion.limpiar();
              }}
              className={`${claseInput} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700`}
            />
          </label>

          <Boton
            type="button"
            disabled={!archivo || cargando}
            onClick={() => analisis.enviar(conArchivo())}
          >
            {analisis.cargando ? "Leyendo…" : "Ver qué va a pasar"}
          </Boton>
        </div>
      </Tarjeta>

      {error && <Aviso tono="error">{error}</Aviso>}

      {aplicado && (
        <Aviso tono="ok">
          Importado: {aplicado.crear} creados, {aplicado.actualizar} actualizados,{" "}
          {aplicado.sinCambios} sin cambios.
        </Aviso>
      )}

      {vista && (
        <Tarjeta>
          <h3 className="mb-1 text-lg font-semibold text-slate-900">
            Vista previa
          </h3>
          <p className="mb-3 text-sm text-slate-600">
            Todavía no se aplicó nada. Lo que no está en el archivo queda como
            está: la planilla nunca borra.
          </p>

          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
              {vista.crear} a crear
            </span>
            <span className="rounded-lg bg-blue-100 px-3 py-1 font-semibold text-blue-800">
              {vista.actualizar} a actualizar
            </span>
            <span className="rounded-lg bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {vista.sinCambios} sin cambios
            </span>
          </div>

          <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Hoja</th>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Qué</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {vista.filas.map((f, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-slate-600">{f.hoja}</td>
                    <td className="cifra px-3 py-1.5 text-slate-500">{f.fila}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium text-slate-800">
                        {f.descripcion}
                      </span>
                      {f.detalle && (
                        <div className="text-xs text-slate-500">{f.detalle}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR[f.accion]}`}
                      >
                        {f.accion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <Boton
              type="button"
              disabled={cargando}
              onClick={() => importacion.enviar(conArchivo())}
            >
              {importacion.cargando ? "Importando…" : "Aplicar"}
            </Boton>
            <Boton type="button" tono="fantasma" onClick={() => setVista(null)}>
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
