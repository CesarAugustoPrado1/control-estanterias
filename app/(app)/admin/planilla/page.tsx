import { Aviso, Pantalla, Seccion, Tarjeta } from "@/components/ui";
import { PanelPlanilla } from "./panel";

export const metadata = { title: "Planilla Excel · Admin" };

export default function Planilla() {
  return (
    <Pantalla
      titulo="Planilla Excel"
      bajada="Carga masiva de familias, modelos, productos y estanterías."
    >
      <div className="mb-4 space-y-3">
        <Aviso>
          <strong>La planilla nunca borra.</strong> Lo que no está en el archivo
          queda como estaba, así que subir una planilla recortada por error no
          puede vaciarte la instalación.
        </Aviso>
        <Aviso>
          <strong>O entra todo o no entra nada.</strong> Una sola fila con
          problema rechaza el archivo entero: después de un import a medias nadie
          sabe qué quedó aplicado.
        </Aviso>
      </div>

      <Seccion titulo="Subir archivo">
        <PanelPlanilla />
      </Seccion>

      <Seccion titulo="Cómo tiene que estar armado">
        <Tarjeta>
          <p className="mb-3 text-sm text-slate-700">
            Una hoja por tabla, en este orden. Productos y Estanterías
            referencian por nombre a Modelos y Familias, así que esas dos van
            primero.
          </p>
          <div className="space-y-3 text-sm">
            <div>
              <strong className="text-slate-900">Familias</strong>
              <div className="text-slate-600">nombre · orden</div>
            </div>
            <div>
              <strong className="text-slate-900">Modelos</strong>
              <div className="text-slate-600">nombre · orden</div>
            </div>
            <div>
              <strong className="text-slate-900">Productos</strong>
              <div className="text-slate-600">
                nombre · modelo · familia · piezas por molde · piezas por paquete
                · pasa por tunel (si/no) · m2 por paquete
              </div>
            </div>
            <div>
              <strong className="text-slate-900">Estanterias</strong>
              <div className="text-slate-600">
                codigo · modelo · familia · moldes
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Acentos, mayúsculas, columnas de más y filas en blanco no molestan.
            Los encabezados aceptan alias: <em>forma</em> por modelo,{" "}
            <em>color</em> por familia.
          </p>
          <a
            href="/admin/exportar?que=maestros"
            className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Descargar lo que hay, en este formato
          </a>
        </Tarjeta>
      </Seccion>
    </Pantalla>
  );
}
