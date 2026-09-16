import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  estanterias,
  familias,
  modelos,
  movimientos,
  productos,
  tandas,
  usuarios,
} from "@/lib/db/schema";
import { numero } from "@/lib/formato";
import { Aviso, Pantalla, Seccion, Tarjeta } from "@/components/ui";

export const metadata = { title: "Admin · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Admin() {
  const [n] = await db
    .select({
      familias: sql<number>`(select count(*) from ${familias})::int`,
      modelos: sql<number>`(select count(*) from ${modelos})::int`,
      productos: sql<number>`(select count(*) from ${productos})::int`,
      productosActivos: sql<number>`(select count(*) from ${productos} where activo)::int`,
      estanterias: sql<number>`(select count(*) from ${estanterias})::int`,
      estanteriasActivas: sql<number>`(select count(*) from ${estanterias} where activa)::int`,
      usuarios: sql<number>`(select count(*) from ${usuarios} where activo)::int`,
      tandas: sql<number>`(select count(*) from ${tandas})::int`,
      movimientos: sql<number>`(select count(*) from ${movimientos})::int`,
    })
    .from(sql`(select 1) as _`);

  const fichas = [
    { t: "Productos", v: `${n.productosActivos} / ${n.productos}`, p: "activos" },
    { t: "Estanterías", v: `${n.estanteriasActivas} / ${n.estanterias}`, p: "activas" },
    { t: "Modelos", v: numero(n.modelos), p: `${n.familias} familias` },
    { t: "Usuarios", v: numero(n.usuarios), p: "activos" },
    { t: "Tandas", v: numero(n.tandas), p: "históricas" },
    { t: "Movimientos", v: numero(n.movimientos), p: "registrados" },
  ];

  return (
    <Pantalla titulo="Administración">
      <Seccion titulo="Qué hay cargado">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {fichas.map((f) => (
            <Tarjeta key={f.t}>
              <div className="text-sm text-slate-600">{f.t}</div>
              <div className="cifra mt-1 text-2xl font-bold text-slate-900">
                {f.v}
              </div>
              <div className="text-xs text-slate-500">{f.p}</div>
            </Tarjeta>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Descargar datos"
        ayuda="El de maestros es el mismo formato que lee el import: exportás, editás en la compu y volvés a subir."
      >
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/exportar?que=maestros"
            className="inline-flex min-h-12 items-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          >
            Maestros (.xlsx)
          </a>
          <a
            href="/admin/exportar?que=todo"
            className="inline-flex min-h-12 items-center rounded-lg bg-white px-5 font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Todo, con historial (.xlsx)
          </a>
        </div>
        <div className="mt-3">
          <Aviso tono="atencion">
            <strong>Ese Excel no es un backup.</strong> Es una copia legible para
            llevarse los números: restaurar las relaciones entre tablas desde una
            planilla no es confiable. El backup de verdad es un{" "}
            <code className="rounded bg-amber-100 px-1">pg_dump</code> programado
            contra Neon.
          </Aviso>
        </div>
      </Seccion>
    </Pantalla>
  );
}
