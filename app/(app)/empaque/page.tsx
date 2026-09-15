import { requerirRol } from "@/lib/auth";
import { cola, listarMotivos } from "@/lib/consultas";
import { Aviso, Pantalla, Seccion } from "@/components/ui";
import { PanelEmpaque } from "./panel";

export const metadata = { title: "Empaque · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Empaque() {
  await requerirRol("empaque");
  const [tandas, motivos] = await Promise.all([
    cola("a_empaquetar"),
    listarMotivos(),
  ]);

  const sinTunel = tandas.filter((t) => t.piezasPorMolde > 1).length;

  return (
    <Pantalla
      titulo="Empaque"
      bajada="Contá los paquetes y cerrá la tanda. Lo más viejo primero."
    >
      {sinTunel > 0 && (
        <div className="mb-4">
          <Aviso>
            Hay {sinTunel} tanda{sinTunel > 1 ? "s" : ""} de productos que no
            pasan por el túnel. Se cuentan y se cierran acá igual: es el único
            punto donde se mide la rotura.
          </Aviso>
        </div>
      )}
      <Seccion titulo="Esperando empaque" cantidad={tandas.length}>
        <PanelEmpaque tandas={tandas} motivos={motivos} />
      </Seccion>
    </Pantalla>
  );
}
