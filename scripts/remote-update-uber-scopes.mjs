#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -e
ENV_FILE='${repo}/.env'
python3 - <<'PY'
from pathlib import Path
import re
p = Path("${repo}/.env")
text = p.read_text(encoding="utf-8")
new = 'UBER_EATS_SCOPES="eats.pos_provisioning"'
text2, n = re.subn(r"^UBER_EATS_SCOPES=.*$", new, text, count=1, flags=re.M)
if n:
    p.write_text(text2, encoding="utf-8")
    print("REPLACED")
elif "UBER_EATS_SCOPES=" not in text:
    p.write_text(text.rstrip() + "\\n" + new + "\\n", encoding="utf-8")
    print("APPENDED")
else:
    print("NO_CHANGE")
PY
grep -E '^UBER_EATS_SCOPES=' "$ENV_FILE"
# reiniciar app para coger env en procesos ya arrancados
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart all --update-env >/dev/null 2>&1 || true
  echo PM2_RESTARTED
fi
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
