import { requerirRol } from "@/lib/auth";
import { panelHorno } from "@/lib/consultas";
import { Aviso, Pantalla } from "@/components/ui";
import { PanelHorno } from "./panel";

export const metadata = { title: "Horno · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Horno() {
  await requerirRol("horno");
  const { enPatio, adentro, cupo, libres } = await panelHorno();

  return (
    <Pantalla
      titulo="Horno"
      bajada={`${adentro.length} de ${cupo} lugares ocupados`}
    >
      {libres === 0 && (
        <div className="mb-4">
          <Aviso tono="atencion">
            El horno está lleno. Lo que mandes a fraguado natural ahora contá
            como <strong>horno lleno</strong>, no como clima: es capacidad
            perdida y ese número es el que después justifica un horno más.
          </Aviso>
        </div>
      )}
      <PanelHorno
        enPatio={enPatio}
        adentro={adentro}
        cupo={cupo}
        libres={libres}
      />
    </Pantalla>
  );
}
