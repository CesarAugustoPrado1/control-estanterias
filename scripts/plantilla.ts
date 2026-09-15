/**
 * Genera `plantilla-datos.xlsx`: el formato exacto que va a leer el import.
 *
 *   npx tsx scripts/plantilla.ts
 *
 * Las hojas van en orden de dependencia (Familias y Modelos antes que
 * Productos, Productos antes que Estanterias) y el import las procesa en ese
 * mismo orden. Las filas de ejemplo estan para borrar: son solo para que se vea
 * el formato de cada columna.
 */
import ExcelJS from "exceljs";

const AZUL = "FF1E3A8A";
const GRIS = "FFF1F5F9";

function encabezar(
  hoja: ExcelJS.Worksheet,
  columnas: { header: string; key: string; width: number; nota?: string }[],
) {
  hoja.columns = columnas.map(({ header, key, width }) => ({
    header,
    key,
    width,
  }));
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  fila.alignment = { vertical: "middle", horizontal: "left" };
  fila.height = 22;
  // La nota queda como comentario en la celda del encabezado: explica la
  // columna sin gastar una fila de la planilla, que despues habria que borrar.
  columnas.forEach((c, i) => {
    if (!c.nota) return;
    hoja.getCell(1, i + 1).note = c.nota;
  });
  hoja.views = [{ state: "frozen", ySplit: 1 }];
}

function ejemplos(hoja: ExcelJS.Worksheet, filas: unknown[][]) {
  for (const f of filas) {
    const r = hoja.addRow(f);
    r.font = { italic: true, color: { argb: "FF64748B" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  }
}

async function main() {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Estanterias";
  libro.created = new Date();

  /* ------------------------------------------------------------------ */
  const guia = libro.addWorksheet("Instrucciones");
  guia.columns = [{ width: 100 }];
  const texto = [
    ["CONTROL DE ESTANTERIAS — plantilla de carga inicial", true],
    ["", false],
    ["Las filas grises en italica son ejemplos. Borralas antes de importar.", false],
    ["", false],
    ["ORDEN DE LAS HOJAS", true],
    ["Cargá primero Familias y Modelos: Productos y Estanterias los referencian", false],
    ["por nombre, y el import falla si no existen.", false],
    ["", false],
    ["QUE ES CADA COSA", true],
    ["Modelo    = la forma de la pieza (Kamba, Uhma...). Define el molde.", false],
    ["Familia   = con qué se puede compartir molde. Dos tonos de beige comparten", false],
    ["            molde; un gris y un beige no, y cemento gris con cemento blanco", false],
    ["            tampoco. Es el criterio de compatibilidad, no el color exacto.", false],
    ["Producto  = modelo x tono exacto. Es lo que se elige al llenar el trompo.", false],
    ["Estanteria= un grupo fijo de moldes. Los 40 moldes de una estantería son", false],
    ["            siempre esos 40 y no se mezclan con los de otra.", false],
    ["", false],
    ["LAS DOS COLUMNAS QUE MAS SE PRESTAN A CONFUSION", true],
    ["piezas por molde   = cuántas piezas salen de UN molde (casi siempre 1;", false],
    ["                     2 en los modelos que dan dos piezas por molde)", false],
    ["piezas por paquete = cuántas piezas entran en UN paquete (casi siempre 1;", false],
    ["                     2 en los que necesitan dos moldes para un paquete)", false],
    ["", false],
    ["   1 molde = 1 paquete   ->  1 y 1", false],
    ["   2 moldes = 1 paquete  ->  1 y 2", false],
    ["   1 molde = 2 piezas    ->  2 y 1", false],
    ["", false],
    ["REGLAS DEL IMPORT", true],
    ["La planilla NUNCA borra: lo que no está en el archivo queda como estaba.", false],
    ["O entra todo o no entra nada: una fila con error rechaza el archivo entero.", false],
    ["Antes de aplicar, la app te muestra fila por fila qué va a pasar.", false],
    ["Acentos, mayúsculas, columnas de más y filas en blanco no molestan.", false],
  ];
  for (const [t, bold] of texto) {
    const r = guia.addRow([t]);
    if (bold) r.font = { bold: true, color: { argb: AZUL } };
  }

  /* ------------------------------------------------------------------ */
  const familias = libro.addWorksheet("Familias");
  encabezar(familias, [
    {
      header: "nombre",
      key: "nombre",
      width: 34,
      nota: "Criterio de compatibilidad de molde. Ej: 'Gris cemento gris'.",
    },
    {
      header: "orden",
      key: "orden",
      width: 10,
      nota: "En qué orden aparece en los selectores. Opcional.",
    },
  ]);
  ejemplos(familias, [
    ["Gris — cemento gris", 1],
    ["Beige — cemento blanco", 2],
  ]);

  /* ------------------------------------------------------------------ */
  const modelos = libro.addWorksheet("Modelos");
  encabezar(modelos, [
    { header: "nombre", key: "nombre", width: 28, nota: "La forma. Ej: Kamba." },
    { header: "orden", key: "orden", width: 10 },
  ]);
  ejemplos(modelos, [
    ["Kamba", 1],
    ["Uhma", 2],
  ]);

  /* ------------------------------------------------------------------ */
  const productos = libro.addWorksheet("Productos");
  encabezar(productos, [
    {
      header: "nombre",
      key: "nombre",
      width: 30,
      nota: "Como lo va a ver el operario al llenar. Ej: 'Kamba Gris Perla'.",
    },
    {
      header: "modelo",
      key: "modelo",
      width: 18,
      nota: "Tiene que existir en la hoja Modelos, escrito igual.",
    },
    {
      header: "familia",
      key: "familia",
      width: 26,
      nota: "Tiene que existir en la hoja Familias, escrito igual.",
    },
    {
      header: "piezas por molde",
      key: "ppm",
      width: 18,
      nota: "Cuántas piezas salen de UN molde. Casi siempre 1.",
    },
    {
      header: "piezas por paquete",
      key: "ppp",
      width: 20,
      nota: "Cuántas piezas entran en UN paquete. Casi siempre 1; 2 si hacen falta dos moldes para un paquete.",
    },
    {
      header: "pasa por tunel",
      key: "tunel",
      width: 16,
      nota: "si / no. Los que no pasan igual se cuentan en la estación de empaque: ahí es donde se mide la rotura.",
    },
    {
      header: "m2 por paquete",
      key: "m2",
      width: 16,
      nota: "Decimal. Es lo que convierte toda la producción a m2.",
    },
  ]);
  ejemplos(productos, [
    ["Kamba Gris Perla", "Kamba", "Gris — cemento gris", 1, 1, "si", 0.26],
    ["Kamba Gris Basalto", "Kamba", "Gris — cemento gris", 1, 1, "si", 0.26],
    ["Uhma Beige Arena", "Uhma", "Beige — cemento blanco", 1, 2, "si", 0.5],
    ["Uhma Beige Trigo", "Uhma", "Beige — cemento blanco", 2, 1, "no", 0.18],
  ]);

  /* ------------------------------------------------------------------ */
  const estanterias = libro.addWorksheet("Estanterias");
  encabezar(estanterias, [
    {
      header: "codigo",
      key: "codigo",
      width: 18,
      nota: "Identificador interno, único. Ej: KAM-GRI-1. Si hoy no las distinguís en el piso, numeralas igual: el sistema cuenta cuántas hay libres de cada modelo+familia.",
    },
    {
      header: "modelo",
      key: "modelo",
      width: 18,
      nota: "Tiene que existir en la hoja Modelos.",
    },
    {
      header: "familia",
      key: "familia",
      width: 26,
      nota: "Tiene que existir en la hoja Familias.",
    },
    {
      header: "moldes",
      key: "moldes",
      width: 12,
      nota: "Cuántos moldes tiene ESTE grupo. Puede variar entre estanterías del mismo producto (39, 38, 40).",
    },
  ]);
  ejemplos(estanterias, [
    ["KAM-GRI-1", "Kamba", "Gris — cemento gris", 40],
    ["KAM-GRI-2", "Kamba", "Gris — cemento gris", 39],
    ["UHM-BEI-1", "Uhma", "Beige — cemento blanco", 39],
    ["UHM-BEI-2", "Uhma", "Beige — cemento blanco", 38],
    ["UHM-BEI-3", "Uhma", "Beige — cemento blanco", 40],
  ]);

  await libro.xlsx.writeFile("plantilla-datos.xlsx");
  console.log("Generado: plantilla-datos.xlsx");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
