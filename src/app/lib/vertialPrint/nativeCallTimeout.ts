export function withNativeCallTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const ms = Number(timeoutMs);
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 8_000;
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(
        new Error(
          `${label} no respondió a tiempo (${Math.round(safeMs / 1000)}s). Comprueba IP, WiFi e impresora encendida.`,
        ),
      );
    }, safeMs);
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
