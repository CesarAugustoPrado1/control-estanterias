import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { requerirRol } from "@/lib/auth";
import { UNIDAD_SALIDA } from "@/lib/estados";
import { empaquePorProducto, llenadoPorProducto, resolverPeriodo } from "@/lib/produccion";

/**
 * El mismo resumen de la pantalla, una fila por producto, para cargar en el
 * ERP. Numeros como numeros (no texto) para que se puedan sumar y pegar.
 */
export async function GET(req: NextRequest) {
  await requerirRol("oficina", "auditor", "trompo");
  const p = req.nextUrl.searchParams;
  const { desde, hasta } = await resolverPeriodo({ desde: p.get("desde"), hasta: p.get("hasta") });
  const [llenado, empaque] = await Promise.all([
    llenadoPorProducto(desde, hasta),
    empaquePorProducto(desde, hasta),
  ]);

  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Estanterias";
  libro.created = new Date();

  const hoja = (nombre: string, columnas: Partial<ExcelJS.Column>[], filas: Record<string, unknown>[]) => {
    const h = libro.addWorksheet(nombre);
    h.columns = columnas;
    const enc = h.getRow(1);
    enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
    enc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    h.views = [{ state: "frozen", ySplit: 1 }];
    for (const f of filas) h.addRow(f);
  };
  const num = (v: string | null) => (v === null ? "" : Number(v));

  hoja(
    "Llenado",
    [
      { header: "modelo", key: "modelo", width: 18 },
      { header: "producto", key: "producto", width: 30 },
      { header: "codigo plataforma proceso", key: "codigo", width: 26 },
      { header: "tandas", key: "tandas", width: 10 },
      { header: "moldes", key: "moldes", width: 10 },
      { header: "salida esperada", key: "esperados", width: 16 },
      { header: "unidad", key: "unidad", width: 16 },
      { header: "m2", key: "m2", width: 12 },
    ],
    llenado.map((f) => ({
      modelo: f.modelo,
      producto: f.producto,
      codigo: f.codigo ?? "",
      tandas: f.tandas,
      moldes: f.moldes,
      esperados: f.esperados,
      unidad: UNIDAD_SALIDA[f.unidad].varios,
      m2: num(f.m2),
    })),
  );

  hoja(
    "Empaquetado",
    [
      { header: "modelo", key: "modelo", width: 18 },
      { header: "producto", key: "producto", width: 30 },
      { header: "codigo plataforma terminado", key: "codigo", width: 28 },
      { header: "tandas", key: "tandas", width: 10 },
      { header: "esperado", key: "esperados", width: 12 },
      { header: "obtenido", key: "obtenidos", width: 12 },
      { header: "diferencia", key: "dif", width: 12 },
      { header: "unidad", key: "unidad", width: 16 },
      { header: "m2 esperados", key: "m2", width: 14 },
      { header: "m2 obtenidos", key: "m2o", width: 14 },
    ],
    empaque.map((f) => ({
      modelo: f.modelo,
      producto: f.producto,
      codigo: f.codigo ?? "",
      tandas: f.tandas,
      esperados: f.esperados,
      obtenidos: f.obtenidos,
      dif: f.obtenidos - f.esperados,
      unidad: UNIDAD_SALIDA[f.unidad].varios,
      m2: num(f.m2),
      m2o: num(f.m2Obtenidos),
    })),
  );

  const buf = await libro.xlsx.writeBuffer();
  const nombre = desde === hasta ? `produccion-${desde}.xlsx` : `produccion-${desde}-a-${hasta}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
