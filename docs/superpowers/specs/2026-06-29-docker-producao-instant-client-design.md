# Docker de producao com Oracle Instant Client

## Contexto

O projeto e uma API Node.js/Express que acessa Oracle Database usando `oracledb`.
A aplicacao ja possui:

- `npm start` para iniciar `src/server.js`;
- `npm test` com testes unitarios;
- rota `GET /health`;
- configuracao por variaveis `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` e `PORT`;
- `data/resources.json` persistido em arquivo e editavel pela GUI admin.

O banco Oracle sera externo ao Docker Compose. O container deve conter Oracle Instant Client porque este ambiente precisa de `oracledb.initOracleClient()` para conectar.

## Decisao

Preparar a imagem de producao em thick mode obrigatorio:

- usar base Linux compativel com os RPMs do Oracle Instant Client, preferencialmente Oracle Linux slim;
- instalar Oracle Instant Client Basic no build da imagem;
- manter `oracledb.initOracleClient()` antes de qualquer pool/conexao;
- permitir configurar `ORACLE_CLIENT_LIB_DIR`, mas funcionar com o caminho padrao do RPM quando a variavel nao for informada;
- permitir `TNS_ADMIN` para `tnsnames.ora`, `sqlnet.ora` ou wallet quando necessario.

Referencias:

- Oracle Instant Client por RPM: https://docs.oracle.com/en/database/oracle/oracle-database/26/lacli/install-instant-client-using-rpm.html
- node-oracledb thick mode e `initOracleClient()`: https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html
- API `initOracleClient()`: https://node-oracledb.readthedocs.io/en/latest/api_manual/oracledb.html

## Arquitetura Docker

### Dockerfile

Criar um `Dockerfile` de producao que:

- parte de uma imagem Oracle Linux slim;
- instala Node.js, npm e Oracle Instant Client Basic;
- copia apenas `package.json` e `package-lock.json` antes de `npm ci --omit=dev`;
- copia `src/`, `public/` e `data/`;
- define `NODE_ENV=production`;
- expoe a porta `3000`;
- roda `npm start`;
- executa como usuario nao-root.

O Dockerfile nao deve copiar `.env`, `node_modules`, logs ou arquivos temporarios.

### docker-compose.yml

Criar um Compose para producao simples, apenas com o servico da API:

- `build: .`;
- `ports: ["3000:3000"]`;
- `restart: unless-stopped`;
- variaveis obrigatorias:
  - `ORACLE_USER`;
  - `ORACLE_PASSWORD`;
  - `ORACLE_CONNECT_STRING`;
- variaveis opcionais:
  - `PORT`;
  - `ORACLE_CLIENT_LIB_DIR`;
  - `TNS_ADMIN`;
- healthcheck chamando `http://localhost:3000/health`;
- volume persistente para `/app/data`, preservando `resources.json` alterado pela GUI admin.

### .dockerignore

Criar `.dockerignore` para reduzir contexto e evitar segredos:

- `node_modules`;
- `.env`;
- logs;
- `.git`;
- caches;
- docs internas de planejamento se nao forem necessarias para a imagem.

## Ajustes de aplicacao

### src/db.js

O arquivo deve inicializar o Oracle Client em thick mode de forma explicita e previsivel.

Regras:

- chamar `oracledb.initOracleClient()` uma unica vez no carregamento do modulo;
- se `ORACLE_CLIENT_LIB_DIR` estiver definido, chamar `oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR })`;
- se `ORACLE_CLIENT_LIB_DIR` nao estiver definido, chamar `oracledb.initOracleClient()` e confiar no carregamento padrao das bibliotecas instaladas pelo RPM;
- manter `oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT`;
- nao criar pool na inicializacao do servidor; manter pool sob demanda como hoje.

### Configuracao de rede Oracle

Para connect strings simples, `ORACLE_CONNECT_STRING` pode continuar no formato `host:porta/service`.

Para ambientes que usam `tnsnames.ora`, `sqlnet.ora` ou wallet, o container deve permitir montar um diretorio em `/opt/oracle/network/admin` e configurar:

```env
TNS_ADMIN=/opt/oracle/network/admin
```

## Persistencia

`data/resources.json` e editado pela interface admin. Em producao, esse arquivo nao pode depender apenas da camada gravavel do container.

O Compose deve montar um volume em `/app/data`. A imagem deve conter um `resources.json` inicial, e o volume deve ser usado para persistir alteracoes entre recriacoes do container.

## Seguranca operacional

- Nao copiar `.env` para a imagem.
- Documentar uso de `.env` local ou variaveis do ambiente do orquestrador.
- Rodar a aplicacao como usuario nao-root.
- Nao expor Oracle no Compose, porque o banco e externo.
- Manter healthcheck sem tocar no banco, usando apenas `/health`.
- Evitar registrar senha Oracle em logs.

## Documentacao

Atualizar o `README.md` com:

- build da imagem;
- execucao com `docker run`;
- execucao com `docker compose`;
- exemplo de `.env` para producao;
- como montar arquivos Oracle em `TNS_ADMIN`;
- observacao de que o banco Oracle e externo;
- observacao de persistencia do volume de `/app/data`.

## Testes e verificacao

O plano de implementacao deve verificar:

- `npm test`;
- build da imagem Docker;
- se possivel, `docker run` sem credenciais reais validando que `/health` responde;
- `docker compose config`;
- UTF-8 sem BOM e sem marcadores de corrupcao nos arquivos alterados.

Nao e obrigatorio validar conexao real com Oracle durante a implementacao, porque depende de credenciais e rede do ambiente de producao.
