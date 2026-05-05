import { Link } from 'react-router-dom';

export function LegalInfoPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <div className="mb-8">
          <Link to="/" className="text-sm font-medium text-blue-700 hover:text-blue-800">
            ← Volver a inicio
          </Link>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
            <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">Aviso legal</h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-700">
              Esta tienda online es titularidad de <strong>Vertial S.L.</strong>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>
                <strong>Razón social:</strong> Vertial S.L.
              </li>
              <li>
                <strong>NIF:</strong> B22653737
              </li>
              <li>
                <strong>Dirección:</strong> Calle Coso 67-75, 3ºC, 50001, Zaragoza, España
              </li>
              <li>
                <strong>Correo electrónico:</strong> soporte@vertialapp.com
              </li>
              <li>
                <strong>Teléfono de contacto:</strong> +34 647 77 98 12
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
            <h2 className="text-xl font-semibold text-slate-950">Cancelaciones, devoluciones y reembolsos</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-700">
              Las políticas de cancelaciones, devoluciones y reembolsos están disponibles de forma clara y accesible en
              esta sección para su consulta previa a la compra.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>
                <strong>Cancelaciones:</strong> se pueden solicitar antes de la preparación o envío del pedido.
              </li>
              <li>
                <strong>Devoluciones:</strong> el cliente dispone de un plazo de 14 días naturales desde la recepción,
                salvo excepciones legales aplicables.
              </li>
              <li>
                <strong>Reembolsos:</strong> una vez validada la devolución, el importe se abona por el mismo método de
                pago en un plazo aproximado de 3 a 10 días hábiles.
              </li>
              <li>
                <strong>Procedimiento:</strong> para iniciar cualquier gestión, contactar por email o teléfono indicando
                número de pedido y motivo.
              </li>
            </ul>
          </section>

        </div>
      </div>
    </main>
  );
}
