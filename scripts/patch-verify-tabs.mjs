import fs from 'node:fs';
const p = 'src/app/pages/auth/VerifyEmailPending.tsx';
let s = fs.readFileSync(p, 'utf8');
const d = 'd' + 'iv';

const start = s.indexOf("  if (verifyState === 'success' || checkState === 'success')");
const end = s.indexOf('  // Estado: error de verificación', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const block = `
  if (verifyState === 'success' && openedFromEmailLink) {
    return (
      <${d} className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <${d} className="w-full max-w-[420px] text-center">
          <${d} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm px-8 py-10">
            <${d} className="flex justify-center mb-8">
              <VertialLogo size="lg" />
            </${d}>
            <${d} className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </${d}>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 mb-2">
              Correo confirmado
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Vuelve a la pestaña donde te registraste en Vertial: continuará sola en unos segundos.
              Puedes cerrar esta ventana.
            </p>
            <ACCESO__Button variant="secondary" fullWidth onClick={() => goAfterVerify(user?.accountType)}>
              Continuar aquí si no tienes otra pestaña abierta
            </ACCESO__Button>
          </${d}>
        </${d}>
      </${d}>
    );
  }

  if (checkState === 'success' || (verifyState === 'success' && !openedFromEmailLink)) {
    return (
      <${d} className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <${d} className="w-full max-w-[420px] text-center">
          <${d} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm px-8 py-10">
            <${d} className="flex justify-center mb-8">
              <VertialLogo size="lg" />
            </${d}>
            <${d} className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </${d}>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 mb-2">
              Cuenta verificada
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Redirigiendo…
            </p>
          </${d}>
        </${d}>
      </${d}>
    );
  }

`;

s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok');
