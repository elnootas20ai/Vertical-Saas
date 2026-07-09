export function withNativeCallTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(
        new Error(
          `${label} tardó demasiado. Comprueba que la impresora está encendida, en la misma WiFi, y que Vertial tiene permiso de «red local» en Ajustes.`,
        ),
      );
    }, timeoutMs);
    promise
      .then((value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      });
  });
}
