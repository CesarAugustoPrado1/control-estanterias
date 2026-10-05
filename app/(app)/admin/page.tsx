import { desc, sql } from "drizzle-orm";
import Link from "next/link";
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
import { haceCuanto, numero } from "@/lib/formato";
import { listarEstanterias, listarFamilias, listarModelos, listarProductos, listarUsuarios } from "@/lib/consultas";
import { ETIQUETA_ESTADO, ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { ETIQUETA_ARIDO, nombreTanda } from "@/lib/tarjetas";
import { Aviso, Pantalla, Seccion, Vacio } from "@/components/ui";

export const metadata = { title: "Admin · Control de Estanterías" };
export const dynamic = "force-dynamic";

/** Lo que se puede desplegar tocando una ficha del resumen. */
const FICHAS = ["productos", "estanterias", "modelos", "usuarios", "tandas", "movimientos"] as const;
type Ficha = (typeof FICHAS)[number];

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const { ver } = await searchParams;
  const abierta = FICHAS.includes(ver as Ficha) ? (ver as Ficha) : null;

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

  const fichas: { k: Ficha; t: string; v: string; p: string }[] = [
    { k: "productos", t: "Productos", v: `${n.productosActivos} / ${n.productos}`, p: "activos" },
    { k: "estanterias", t: "Estanterías", v: `${n.estanteriasActivas} / ${n.estanterias}`, p: "activas" },
    { k: "modelos", t: "Modelos", v: numero(n.modelos), p: `${n.familias} familias` },
    { k: "usuarios", t: "Usuarios", v: numero(n.usuarios), p: "activos" },
    { k: "tandas", t: "Tandas", v: numero(n.tandas), p: "históricas" },
    { k: "movimientos", t: "Movimientos", v: numero(n.movimientos), p: "registrados" },
  ];

  return (
    <Pantalla titulo="Administración">
      <Seccion titulo="Qué hay cargado">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {fichas.map((f) => (
            <Link
              key={f.k}
              href={abierta === f.k ? "/admin" : `/admin?ver=${f.k}`}
              scroll={false}
              aria-expanded={abierta === f.k}
              className={`block rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-slate-50 ${
                abierta === f.k ? "ring-2 ring-blue-600" : "ring-1 ring-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
                {f.t}
                <span className="text-xs text-blue-700">{abierta === f.k ? "▲" : "▼"}</span>
              </div>
              <div className="cifra mt-1 text-2xl font-bold text-slate-900">
                {f.v}
              </div>
              <div className="text-xs text-slate-500">{f.p}</div>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Tocá cualquier ficha para ver la lista.</p>
        {abierta && (
          <div className="mt-3">
            <Detalle ficha={abierta} />
          </div>
        )}
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

/* -------------------------------------------------------------------------- */
/* Lista desplegada de una ficha                                              */
/* -------------------------------------------------------------------------- */

type Item = { id: number | string; titulo: string; detalle?: string; marca?: string; href?: string };

const ULTIMAS = 20;

async function Detalle({ ficha }: { ficha: Ficha }) {
  const { items, ir, irTexto, nota } = await itemsDe(ficha);
  return (
    <div className="rounded-xl bg-white shadow-sm ring-2 ring-blue-600">
      {items.length === 0 ? (
        <div className="p-3">
          <Vacio>Todavía no hay nada cargado.</Vacio>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => {
            const cuerpo = (
              <>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{i.titulo}</div>
                  {i.detalle && <div className="text-sm text-slate-600">{i.detalle}</div>}
                </div>
                {i.marca && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {i.marca}
                  </span>
                )}
              </>
            );
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50">
                    {cuerpo}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">{cuerpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-sm">
        <span className="text-slate-500">{nota}</span>
        <Link href={ir} className="font-semibold text-blue-700">
          {irTexto} →
        </Link>
      </div>
    </div>
  );
}

async function itemsDe(
  ficha: Ficha,
): Promise<{ items: Item[]; ir: string; irTexto: string; nota?: string }> {
  switch (ficha) {
    case "productos": {
      const ps = await listarProductos();
      return {
        ir: "/admin/productos",
        irTexto: "Editar productos",
        items: ps.map((x) => ({
          id: x.p.id,
          titulo: x.p.nombre,
          detalle: `${x.modelo} · ${x.familia} · cemento ${x.p.cemento} · ${ETIQUETA_ARIDO[x.p.arido]}`,
          marca: x.p.activo ? undefined : "de baja",
        })),
      };
    }
    case "estanterias": {
      const es = await listarEstanterias();
      return {
        ir: "/admin/estanterias",
        irTexto: "Editar estanterías",
        items: es.map((e) => ({
          id: e.id,
          titulo: e.etiqueta,
          detalle: `${e.moldes} moldes · código ${e.codigo}`,
          marca: !e.activa ? "de baja" : e.ocupadaPor ? `en uso: ${e.ocupadaPor}` : "libre",
        })),
      };
    }
    case "modelos": {
      const [ms, fs] = await Promise.all([listarModelos(), listarFamilias()]);
      return {
        ir: "/admin/modelos",
        irTexto: "Editar modelos y familias",
        nota: `Familias: ${fs.map((f) => f.nombre).join(", ") || "ninguna"}`,
        items: ms.map((m) => ({
          id: m.id,
          titulo: m.nombre,
          marca: m.activo ? undefined : "de baja",
        })),
      };
    }
    case "usuarios": {
      const us = await listarUsuarios();
      return {
        ir: "/admin/usuarios",
        irTexto: "Editar usuarios",
        items: us.map((u) => ({
          id: u.id,
          titulo: u.nombre,
          detalle: `${u.usuario} · ${ETIQUETA_ROL[u.rol]}`,
          marca: u.activo ? undefined : "inactivo",
        })),
      };
    }
    case "tandas": {
      const ts = await db.select().from(tandas).orderBy(desc(tandas.creadaEn)).limit(ULTIMAS);
      return {
        ir: "/movimientos",
        irTexto: "Ver movimientos",
        nota: `Las últimas ${ULTIMAS}. Tocá una para ver su detalle.`,
        items: ts.map((t) => ({
          id: t.id,
          titulo: `${nombreTanda(t)} · ${t.productoNombre}`,
          detalle: `${t.estanteriaEtiqueta ?? "sin estantería"} · ${haceCuanto(t.creadaEn)}`,
          marca: ETIQUETA_ESTADO[t.estado],
          href: `/tanda/${t.codigo}`,
        })),
      };
    }
    case "movimientos": {
      const ms = await db.select().from(movimientos).orderBy(desc(movimientos.creadoEn), desc(movimientos.id)).limit(ULTIMAS);
      return {
        ir: "/movimientos",
        irTexto: "Ver todos los movimientos",
        nota: `Los últimos ${ULTIMAS}.`,
        items: ms.map((m) => ({
          id: m.id,
          titulo: `${ETIQUETA_MOVIMIENTO[m.tipo]} · ${m.tandaPalabra?.toUpperCase() ?? m.tandaCodigo}`,
          detalle: `${m.productoNombre} · ${m.usuarioNombre} · ${haceCuanto(m.creadoEn)}`,
          href: `/tanda/${m.tandaCodigo}`,
        })),
      };
    }
  }
}
