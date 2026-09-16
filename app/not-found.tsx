import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">No existe eso</h1>
        <p className="mt-2 text-slate-600">
          Si buscabas una tanda por su código, fijate que esté bien escrito: son
          una E, un guion y cinco dígitos, como <strong>E-00042</strong>.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-blue-700 px-6 font-semibold text-white hover:bg-blue-800"
        >
          Ir a mi pantalla
        </Link>
      </div>
    </main>
  );
}
