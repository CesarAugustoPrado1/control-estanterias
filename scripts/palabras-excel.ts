/**
 * Genera `datos/palabras-tarjetas.xlsx` a partir de `datos/palabras.json`.
 *
 *   npx tsx scripts/palabras-excel.ts
 *
 * El JSON es la fuente de verdad; el Excel es para revisar a mano: una hoja por
 * dia, con una columna para marcar las palabras que no gustan. Cuando se decide
 * sacar alguna, se corrige el JSON y se vuelve a generar el Excel, no al reves.
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

type Dia = {
  letra: string;
  dia: string;
  color: string;
  colorHex: string;
  palabras: string[];
};

/**
 * Cuanto se va a usar cada tramo de la lista, con ~16 llenados por dia y la
 * regla "siempre la primera libre de arriba para abajo". Es lo que explica por
 * que el orden importa mas que el largo: las de arriba salen todos los dias.
 */
function uso(orden: number): string {
  if (orden <= 20) return "Todos los días";
  if (orden <= 30) return "Días de mucha producción";
  return "Solo si algo se demora";
}

const ARGB = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

/**
 * Mismo criterio que scripts/verificar-palabras.py: consonantes iniciales mas la
 * primera vocal (BArco, BRUjula, GUitarra), o las dos primeras letras si empieza
 * con vocal (ABeja). Por letras, no por sonido.
 */
function comienzo(palabra: string): string {
  const s = palabra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if ("aeiou".includes(s[0])) return s.slice(0, 2);
  let i = 0;
  while (i < s.length && !"aeiou".includes(s[i])) i++;
  return s.slice(0, i + 1);
}

async function main() {
  const datos = JSON.parse(
    readFileSync("datos/palabras.json", "utf-8"),
  ) as { dias: Dia[] };

  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Estanterias";

  const guia = libro.addWorksheet("Cómo revisar");
  guia.columns = [{ width: 100 }];
  const lineas: [string, boolean][] = [
    ["PALABRAS PARA LAS TARJETAS DE TANDA", true],
    ["", false],
    ["Una hoja por día. Marcá con una X en la columna «¿Sacar?» las que no te gusten,", false],
    ["y si querés escribí por qué en «Comentario». Después se reemplazan.", false],
    ["", false],
    ["CÓMO SE USAN", true],
    ["La letra dice el día del llenado. El color de la tarjeta, también.", false],
    ["Siempre se usa la PRIMERA palabra libre de arriba para abajo.", false],
    ["Por eso las de arriba salen todos los días y las de abajo casi nunca:", false],
    ["conviene revisar con más cuidado las primeras 20 o 30 de cada hoja.", false],
    ["", false],
    ["REGLAS CON LAS QUE SE ARMARON", true],
    ["Sustantivos concretos y conocidos: cosas que se pueden imaginar.", false],
    ["Cada día es un sonido: la C solo como CA, CO, CU, CL, CR; la G como GA, GO, GU, GL, GR;", false],
    ["ninguna empieza con H muda; ningún día usa V, K ni Q.", false],
    ["Rondas: dentro de cada ronda, cada palabra empieza distinto (BArco, BIcicleta, BOta,", false],
    ["BUho, BRUjula...). Recién cuando se usan todos los comienzos, arranca otra ronda.", false],
    ["Así las palabras que conviven el mismo día se distinguen desde la primera sílaba.", false],
    ["Ningún par del mismo día difiere en una sola letra (búho/buzo, bandera/bañera).", false],
    ["Entre las primeras 25 de cada día, tampoco en dos letras (bombo/bolso, funda/falda).", false],
    ["Ninguna palabra se repite entre días.", false],
    ["", false],
    ["PALABRAS QUE SE DEJARON AFUERA A PROPÓSITO", true],
    ["Del proceso: trompo, molde, horno, patio, palet, túnel, placa, tarjeta, gancho, balde...", false],
    ["Colores y tonos: beige, gris, negro, blanco, arena, perla, café, canela, almendra, durazno...", false],
    ["Materiales que se usan en planta: cemento, cal, piedra, ladrillo, baldosa, azulejo...", false],
    ["Objetos de seguridad o alarma: fuego, gas, casco, guante...", false],
    ["Las que en planta se prestan a chiste o sirven de insulto: burro, foca, gato, ganso, gorila...", false],
    ["", false],
    ["Si ves alguna que coincida con el nombre de un tono de tus productos, sacala:", false],
    ["no conozco todos los nombres comerciales.", false],
  ];
  for (const [t, negrita] of lineas) {
    const fila = guia.addRow([t]);
    if (negrita) fila.font = { bold: true, color: { argb: "FF1E3A8A" } };
  }

  for (const d of datos.dias) {
    const nombre = `${d.letra} · ${d.dia[0].toUpperCase()}${d.dia.slice(1)}`;
    const hoja = libro.addWorksheet(nombre, {
      properties: { tabColor: { argb: ARGB(d.colorHex) } },
    });
    hoja.columns = [
      { header: "Orden", key: "orden", width: 8 },
      { header: "Palabra", key: "palabra", width: 22 },
      { header: "Comienzo", key: "comienzo", width: 11 },
      { header: "Ronda", key: "ronda", width: 8 },
      { header: "Uso esperado", key: "uso", width: 26 },
      { header: "¿Sacar?", key: "sacar", width: 10 },
      { header: "Comentario", key: "comentario", width: 44 },
    ];
    const enc = hoja.getRow(1);
    enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
    enc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(d.colorHex) } };
    enc.height = 22;
    hoja.views = [{ state: "frozen", ySplit: 1 }];

    const vistos = new Map<string, number>();
    d.palabras.forEach((p, i) => {
      const orden = i + 1;
      const c = comienzo(p);
      const ronda = (vistos.get(c) ?? 0) + 1;
      vistos.set(c, ronda);
      const fila = hoja.addRow({
        orden,
        palabra: p.toUpperCase(),
        comienzo: c.toUpperCase(),
        ronda,
        uso: uso(orden),
        sacar: "",
        comentario: "",
      });
      fila.getCell("palabra").font = { bold: orden <= 20, size: orden <= 20 ? 12 : 11 };
      if (orden <= 20) {
        fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      fila.getCell("sacar").alignment = { horizontal: "center" };
    });
  }

  await libro.xlsx.writeFile("datos/palabras-tarjetas.xlsx");
  console.log("Generado: datos/palabras-tarjetas.xlsx");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
