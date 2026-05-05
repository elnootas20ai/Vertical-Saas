import { spawnSync } from 'node:child_process';

/**
 * Ejecuta un script bash remoto sin usar stdin del cliente SSH.
 *
 * Importante en Windows: `ssh ... bash -s` + script por stdin rompe la petición
 * de contraseña (SSH y el script compiten por stdin y parece que “se cuelga”).
 *
 * Aquí el script va en base64 en la línea remota: echo … | base64 -d | bash
 */
export function sshRunScript(user, host, identityFile, bashScript) {
  const b64 = Buffer.from(bashScript, 'utf8').toString('base64');
  const remoteCmd = `echo ${b64} | base64 -d | bash`;

  const args = ['-o', 'ConnectTimeout=25', '-o', 'ServerAliveInterval=5'];
  if (identityFile?.trim()) {
    args.push('-i', identityFile.trim());
  }
  args.push(`${user}@${host}`, remoteCmd);

  return spawnSync('ssh', args, {
    stdio: 'inherit',
  });
}
