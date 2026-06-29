# Docker Producao com Oracle Instant Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar a API para rodar em Docker em producao usando Oracle Instant Client em thick mode e conectando a um Oracle externo.

**Architecture:** A aplicacao continua sendo um servico Node.js/Express unico. O container instala Node.js, dependencias npm de producao e Oracle Instant Client Basic; `src/db.js` inicializa `oracledb` em thick mode com `ORACLE_CLIENT_LIB_DIR` opcional. O Compose sobe apenas a API, recebe credenciais por ambiente, usa `/health` para healthcheck e persiste `/app/data`.

**Tech Stack:** Node.js CommonJS, Express, node-oracledb thick mode, Oracle Linux slim, Oracle Instant Client RPM, Docker, Docker Compose.

---

## Nota sobre versionamento

Este workspace nao esta dentro de um repositorio Git: `git status --short` retorna `fatal: not a git repository`. Por isso, este plano usa checkpoints de verificacao em vez de passos de commit. Se a implementacao for executada dentro de um repositorio Git, crie commits pequenos ao final de cada tarefa com os arquivos citados.

## Referencias Tecnicas

- Oracle Instant Client por RPM: https://docs.oracle.com/en/database/oracle/oracle-database/26/lacli/install-instant-client-using-rpm.html
- Downloads Oracle Instant Client Linux: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html
- node-oracledb thick mode: https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html
- `oracledb.initOracleClient()`: https://node-oracledb.readthedocs.io/en/latest/api_manual/oracledb.html

## File Structure

- Create: `src/oracleClientConfig.js`
  - Responsavel apenas por transformar variaveis de ambiente em opcoes para `oracledb.initOracleClient()`.
- Create: `test/oracleClientConfig.test.js`
  - Testa a regra de `ORACLE_CLIENT_LIB_DIR` sem carregar `oracledb` nem depender de Instant Client local.
- Modify: `src/db.js`
  - Usa o helper de configuracao e inicializa thick mode uma vez antes de criar pool/conexao.
- Create: `Dockerfile`
  - Imagem de producao com Oracle Linux slim, Oracle Instant Client Basic, dependencias npm e usuario nao-root.
- Create: `.dockerignore`
  - Remove segredos, dependencias locais, cache e docs internas do contexto Docker.
- Create: `docker-compose.yml`
  - Servico unico da API, healthcheck, variaveis de ambiente e volume persistente para `/app/data`.
- Modify: `.env.example`
  - Documenta variaveis Docker/producao para Instant Client e `TNS_ADMIN`.
- Modify: `README.md`
  - Documenta build/run/compose, Oracle externo, Instant Client, `TNS_ADMIN` e persistencia de `resources.json`.

### Task 1: Oracle Client Config Helper

**Files:**
- Create: `test/oracleClientConfig.test.js`
- Create: `src/oracleClientConfig.js`

- [ ] **Step 1: Write the failing tests**

Create `test/oracleClientConfig.test.js`:

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildOracleClientOptions } = require('../src/oracleClientConfig');

test('buildOracleClientOptions returns undefined when ORACLE_CLIENT_LIB_DIR is not set', () => {
  assert.equal(buildOracleClientOptions({}), undefined);
});

test('buildOracleClientOptions returns undefined when ORACLE_CLIENT_LIB_DIR is blank', () => {
  assert.equal(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '   ' }), undefined);
});

test('buildOracleClientOptions returns libDir when ORACLE_CLIENT_LIB_DIR is set', () => {
  assert.deepEqual(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '/usr/lib/oracle/23/client64/lib' }), {
    libDir: '/usr/lib/oracle/23/client64/lib',
  });
});

test('buildOracleClientOptions trims ORACLE_CLIENT_LIB_DIR', () => {
  assert.deepEqual(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '  /opt/oracle/instantclient  ' }), {
    libDir: '/opt/oracle/instantclient',
  });
});
```

- [ ] **Step 2: Run tests and verify the new test fails**

Run:

```bash
npm test
```

Expected: FAIL with a module resolution error similar to:

```text
Cannot find module '../src/oracleClientConfig'
```

- [ ] **Step 3: Add the helper implementation**

Create `src/oracleClientConfig.js`:

```js
function buildOracleClientOptions(env = process.env) {
  const libDir = String(env.ORACLE_CLIENT_LIB_DIR || '').trim();

  if (!libDir) {
    return undefined;
  }

  return { libDir };
}

module.exports = {
  buildOracleClientOptions,
};
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npm test
```

Expected: PASS. Existing `resourceService` tests and the new `oracleClientConfig` tests pass.

### Task 2: Wire Thick Mode Initialization in db.js

**Files:**
- Modify: `src/db.js:1-6`
- Test: `npm test`

- [ ] **Step 1: Replace the top of db.js**

Replace the first six lines of `src/db.js`:

```js
const oracledb = require('oracledb');
require('dotenv').config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.initOracleClient();
```

with:

```js
const oracledb = require('oracledb');
require('dotenv').config();

const { buildOracleClientOptions } = require('./oracleClientConfig');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const oracleClientOptions = buildOracleClientOptions();
if (oracleClientOptions) {
  oracledb.initOracleClient(oracleClientOptions);
} else {
  oracledb.initOracleClient();
}
```

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: PASS. This confirms the new helper remains compatible with the current local Oracle Client setup and does not break existing service tests.

- [ ] **Step 3: Smoke-test custom libDir option syntax**

Run this command to validate the helper behavior without actually initializing `oracledb`:

```bash
node -e "const { buildOracleClientOptions } = require('./src/oracleClientConfig'); console.log(JSON.stringify(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: ' /usr/lib/oracle/23/client64/lib ' })))"
```

Expected output:

```text
{"libDir":"/usr/lib/oracle/23/client64/lib"}
```

### Task 3: Docker Runtime Files

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM container-registry.oracle.com/os/oraclelinux:9-slim

ENV NODE_ENV=production \
    PORT=3000 \
    ORACLE_CLIENT_LIB_DIR=/usr/lib/oracle/23/client64/lib \
    TNS_ADMIN=/opt/oracle/network/admin

WORKDIR /app

RUN microdnf install -y \
      oracle-instantclient-release-26ai-el9 \
      oracle-instantclient-basic \
      nodejs \
      npm \
      shadow-utils \
    && microdnf clean all \
    && rm -rf /var/cache/dnf /var/cache/yum

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY src ./src
COPY public ./public
COPY data ./data

RUN mkdir -p /opt/oracle/network/admin /app/data \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /sbin/nologin app \
    && chown -R app:app /app /opt/oracle/network/admin

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.PORT||3000;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:4000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

CMD ["npm", "start"]
```

- [ ] **Step 2: Create .dockerignore**

Create `.dockerignore`:

```dockerignore
.env
.git
.gitignore
Dockerfile
docker-compose.yml
docs/superpowers
node_modules
npm-debug.log*
*.log
.dockerignore
.DS_Store
coverage
```

- [ ] **Step 3: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  api:
    build:
      context: .
    image: sinter-mega-rest:prod
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      ORACLE_USER: ${ORACLE_USER:?ORACLE_USER obrigatorio}
      ORACLE_PASSWORD: ${ORACLE_PASSWORD:?ORACLE_PASSWORD obrigatorio}
      ORACLE_CONNECT_STRING: ${ORACLE_CONNECT_STRING:?ORACLE_CONNECT_STRING obrigatorio}
      ORACLE_CLIENT_LIB_DIR: ${ORACLE_CLIENT_LIB_DIR:-/usr/lib/oracle/23/client64/lib}
      TNS_ADMIN: ${TNS_ADMIN:-/opt/oracle/network/admin}
    volumes:
      - resources-data:/app/data
      # Para tnsnames.ora, sqlnet.ora ou wallet, descomente e ajuste:
      # - ./oracle-network-admin:/opt/oracle/network/admin:ro
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "const http=require('http');const port=process.env.PORT||3000;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:4000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"
        ]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  resources-data:
```

- [ ] **Step 4: Validate Compose syntax with sample environment**

Run in PowerShell:

```powershell
$env:ORACLE_USER='app_user'
$env:ORACLE_PASSWORD='app_password'
$env:ORACLE_CONNECT_STRING='oracle.example.com:1521/ORCLPDB1'
$env:PORT='3000'
docker compose config
```

Expected: PASS. The rendered config includes one `api` service, image `sinter-mega-rest:prod`, healthcheck, and volume `resources-data`.

If Docker Compose is not installed, record the exact command failure and continue to Task 4; do not change YAML based on guesswork.

### Task 4: Environment and README Documentation

**Files:**
- Modify: `.env.example:1-6`
- Modify: `README.md:18-67`

- [ ] **Step 1: Replace .env.example content**

Replace `.env.example` with:

```env
PORT=3000

# Oracle Database externo
ORACLE_USER=seu_usuario
ORACLE_PASSWORD=sua_senha
ORACLE_CONNECT_STRING=oracle.example.com:1521/ORCLPDB1

# Oracle Instant Client dentro do container
ORACLE_CLIENT_LIB_DIR=/usr/lib/oracle/23/client64/lib

# Opcional: diretorio para tnsnames.ora, sqlnet.ora ou wallet
TNS_ADMIN=/opt/oracle/network/admin
```

- [ ] **Step 2: Add Docker production docs to README**

In `README.md`, after the paragraph ending with `A conexao Oracle e aberta sob demanda...`, add this section:

````md
## Docker em Producao

A imagem de producao inclui Oracle Instant Client e usa `oracledb` em thick mode com `initOracleClient()`. O Oracle Database nao sobe no Compose; informe um banco externo em `ORACLE_CONNECT_STRING`.

Build da imagem:

```bash
docker build -t sinter-mega-rest:prod .
```

Executar com `docker run`:

```bash
docker run -d --name sinter-mega-rest \
  -p 3000:3000 \
  -e ORACLE_USER=seu_usuario \
  -e ORACLE_PASSWORD=sua_senha \
  -e ORACLE_CONNECT_STRING=oracle.example.com:1521/ORCLPDB1 \
  -v sinter-mega-resources:/app/data \
  sinter-mega-rest:prod
```

Executar com Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

Variaveis principais:

```env
ORACLE_USER=seu_usuario
ORACLE_PASSWORD=sua_senha
ORACLE_CONNECT_STRING=oracle.example.com:1521/ORCLPDB1
ORACLE_CLIENT_LIB_DIR=/usr/lib/oracle/23/client64/lib
TNS_ADMIN=/opt/oracle/network/admin
PORT=3000
```

Para ambientes com `tnsnames.ora`, `sqlnet.ora` ou wallet, monte os arquivos no diretorio configurado em `TNS_ADMIN`:

```yaml
volumes:
  - ./oracle-network-admin:/opt/oracle/network/admin:ro
```

O Compose monta um volume em `/app/data` para preservar `data/resources.json`, que pode ser alterado pela GUI admin. Sem esse volume, alteracoes feitas dentro do container podem ser perdidas ao recriar o container.

O healthcheck usa apenas `GET /health`; ele valida que a API esta respondendo, sem exigir conexao ativa com Oracle.
````

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Documentation changes should not affect tests.

### Task 5: Docker Build and Runtime Verification

**Files:**
- Verify: `Dockerfile`
- Verify: `.dockerignore`
- Verify: `docker-compose.yml`
- Verify: `src/db.js`
- Verify: `.env.example`
- Verify: `README.md`

- [ ] **Step 1: Run Node tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Build the Docker image**

Run:

```bash
docker build -t sinter-mega-rest:prod .
```

Expected: PASS. The build installs Oracle Instant Client Basic, runs `npm ci --omit=dev`, and produces image `sinter-mega-rest:prod`.

If Docker is not installed or cannot access the Oracle container registry/yum repositories, capture the exact error. Do not mark Docker build verified if this command fails.

- [ ] **Step 3: Run the container healthcheck without Oracle credentials**

Run:

```bash
docker rm -f sinter-mega-rest-smoke 2>nul || true
docker run -d --name sinter-mega-rest-smoke -p 3000:3000 sinter-mega-rest:prod
```

Then run:

```bash
node -e "fetch('http://127.0.0.1:3000/health').then(async r => { console.log(r.status); console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(error => { console.error(error); process.exit(1); })"
```

Expected output includes:

```text
200
{"status":"ok"}
```

Cleanup:

```bash
docker rm -f sinter-mega-rest-smoke
```

If port `3000` is already in use, use another host port:

```bash
docker run -d --name sinter-mega-rest-smoke -p 3001:3000 sinter-mega-rest:prod
node -e "fetch('http://127.0.0.1:3001/health').then(async r => { console.log(r.status); console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(error => { console.error(error); process.exit(1); })"
docker rm -f sinter-mega-rest-smoke
```

- [ ] **Step 4: Validate Docker Compose config**

Run in PowerShell:

```powershell
$env:ORACLE_USER='app_user'
$env:ORACLE_PASSWORD='app_password'
$env:ORACLE_CONNECT_STRING='oracle.example.com:1521/ORCLPDB1'
$env:PORT='3000'
docker compose config
```

Expected: PASS. The rendered config includes service `api`, volume `resources-data`, and healthcheck.

- [ ] **Step 5: Validate UTF-8 without BOM and corruption markers**

Run in PowerShell:

```powershell
$paths = @(
  'Dockerfile',
  '.dockerignore',
  'docker-compose.yml',
  '.env.example',
  'README.md',
  'src\db.js',
  'src\oracleClientConfig.js',
  'test\oracleClientConfig.test.js'
)

$results = foreach ($path in $paths) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $badChars = @([char]0x00C3, [char]0xFFFD, [char]0x00C2)
  $hasCorruptionMarker = [bool]($badChars | Where-Object { $text.Contains([string]$_) } | Select-Object -First 1)
  [pscustomobject]@{
    Path = $path
    HasBom = $hasBom
    HasCorruptionMarker = $hasCorruptionMarker
  }
}

$results | Format-Table -AutoSize
if ($results | Where-Object { $_.HasBom -or $_.HasCorruptionMarker }) { exit 1 }
```

Expected: every file prints `HasBom : False` and `HasCorruptionMarker : False`.

- [ ] **Step 6: Review changed files**

Run:

```bash
git diff -- Dockerfile .dockerignore docker-compose.yml .env.example README.md src/db.js src/oracleClientConfig.js test/oracleClientConfig.test.js
```

Expected if running inside a Git repository: diff only includes Docker runtime files, Oracle Client config helper, `db.js` wiring, environment documentation, and README production instructions.

Expected in the current workspace: this command may fail with `fatal: not a git repository`, because the current directory is not a Git repo.
