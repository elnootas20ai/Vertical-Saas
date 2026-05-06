# Push a GitHub sin error 403 (cuenta equivocada)

Si ves `Permission to … denied to UdarEdge` (u otro usuario), Git está usando **credenciales de una cuenta** que **no tiene permiso** de escritura en el repo.

## Opción A — Remoto SSH (necesitas clave pública en GitHub)

```bash
git remote set-url origin git@github.com:elnootas20ai/Vertical-Saas.git
ssh -T git@github.com
git push origin main
```

Si ves `Permission denied (publickey)`, falta subir tu clave SSH en GitHub (**Settings → SSH keys**) en la cuenta que tiene permiso, o usa **Opción B**.

Si `ssh -T` saluda con el usuario **equivocado**, en `~/.ssh/config` usa `Host github.com` + `IdentityFile` apuntando a la clave correcta.

Primera vez en esta máquina puede hacer falta aceptar la huella del host:

```bash
ssh -o StrictHostKeyChecking=accept-new -T git@github.com
```

## Opción B — HTTPS con inicio de sesión correcto (Windows)

1. Abre **Administrador de credenciales de Windows** → Credenciales de Windows → elimina entradas de `git:https://github.com`.
2. Vuelve a hacer push; Git pedirá usuario/contraseña: usa **Personal Access Token (classic)** como contraseña, con scope `repo`, de la cuenta con permiso.

O con GitHub CLI:

```bash
gh auth logout
gh auth login -h github.com -p https -s repo
git push origin main
```

## Opción C — Que te den acceso

El dueño del repo (`elnootas20ai`) debe añadir tu usuario **UdarEdge** como **Collaborator** (Settings → Collaborators) con rol que permita push.
