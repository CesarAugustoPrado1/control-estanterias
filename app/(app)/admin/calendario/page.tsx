import { asc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendario } from "@/lib/db/schema";
import { hoy, sumarDias } from "@/lib/periodo";
import { Aviso, Pantalla } from "@/components/ui";
import { PanelCalendario } from "./panel";

export const metadata = { title: "Calendario · Admin" };
export const dynamic = "force-dynamic";

/**
 * Dias habiles: por defecto de lunes a viernes; aca van las excepciones. Se
 * muestran desde hace un mes en adelante: lo viejo ya no cambia ninguna
 * sugerencia.
 */
export default async function Calendario() {
  const filas = await db
    .select()
    .from(calendario)
    .where(gte(calendario.dia, sumarDias(hoy(), -30)))
    .orderBy(asc(calendario.dia));

  return (
    <Pantalla titulo="Calendario">
      <div className="mb-4">
        <Aviso>
          Por defecto se trabaja de <strong>lunes a viernes</strong>, sin los feriados nacionales. Acá van las
          excepciones: un feriado o un sábado que se trabaja, o un día de semana que no (vacaciones). El programa
          lo usa para sugerir el día de desmolde: el primer día hábil después del tiempo mínimo.
        </Aviso>
      </div>
      <PanelCalendario
        dias={filas.map((f) => ({ dia: f.dia, laborable: f.laborable, nombre: f.nombre }))}
        hoy={hoy()}
      />
    </Pantalla>
  );
}
