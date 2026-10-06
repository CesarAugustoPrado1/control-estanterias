import { requerirRol } from "@/lib/auth";
import { colaEmpaque, empaqueParado, listarMotivos } from "@/lib/consultas";
import { haceCuanto } from "@/lib/formato";
import { Aviso, Pantalla, Seccion } from "@/components/ui";
import { Desvio } from "./desvio";
import { PanelEmpaque } from "./panel";

export const metadata = { title: "Empaque · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Empaque() {
  await requerirRol("empaque");
  const [tandas, motivos, parado] = await Promise.all([
    colaEmpaque(),
    listarMotivos(),
    empaqueParado(),
  ]);

  const sinTunel = tandas.filter((t) => !t.requiereTunel).length;

  return (
    <Pantalla
      titulo="Empaque"
      bajada="Contá lo que salió (paquetes, unidades o niveles) y cerrá la tanda. Lo más viejo primero."
    >
      {/* El texto relativo se arma en el servidor y viaja como prop: el cliente
          no lo recalcula, asi que no hay diferencia de hidratacion. */}
      <Desvio
        parado={
          parado
            ? {
                texto: parado.texto,
                usuarioNombre: parado.usuarioNombre,
                desde: haceCuanto(parado.creadoEn),
              }
            : null
        }
      />
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
