import { Formulario } from "./formulario";

export const metadata = { title: "Entrar · Control de Estanterías" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-2xl font-bold text-white">
            E
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Control de Estanterías
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Trompo · Patio · Horno · Desmolde · Empaque
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <Formulario volver={volver} />
        </div>
      </div>
    </main>
  );
}
