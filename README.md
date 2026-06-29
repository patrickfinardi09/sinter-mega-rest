# Mini ORDS em Node.js com Oracle Database

POC simples inspirada no Oracle REST Data Services: uma rota REST generica expoe apenas resources liberados em whitelist e consulta tabelas Oracle com SQL puro, bind variables, paginacao, ordenacao e filtros simples.

## Arquitetura

- `src/server.js`: inicializa o Express, registra a API REST e serve a GUI admin.
- `src/db.js`: configura o pool de conexoes com o driver oficial `oracledb`.
- `src/resources.js`: le, valida e persiste a whitelist de resources.
- `src/controllers/resourceController.js`: valida o resource da URL e chama o servico. O comentario indica onde entraria JWT/API Key.
- `src/controllers/adminController.js`: endpoints usados pela GUI para editar resources.
- `src/services/resourceService.js`: monta SQL seguro usando bind variables e identificadores validados.
- `src/services/oracleMetadataService.js`: le `USER_TAB_COLUMNS` para mapear colunas automaticamente na GUI.
- `public/`: HTML, CSS e JS da interface admin.
- `data/resources.json`: whitelist persistida de resources, tabelas e colunas permitidas.
- `sql/schema.sql`: exemplo de tabelas e dados para `PRODUTOS` e `CLIENTES`.

## Instalacao

```bash
npm install
```

Configure o arquivo `.env`:

```env
ORACLE_USER=seu_usuario
ORACLE_PASSWORD=sua_senha
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
PORT=3000
```

Crie as tabelas de exemplo:

```bash
sqlplus seu_usuario/sua_senha@localhost:1521/XEPDB1 @sql/schema.sql
```

Ou execute o conteudo de `sql/schema.sql` na sua ferramenta Oracle preferida.

## Execucao

```bash
npm run dev
```

Ou:

```bash
npm start
```

A API ficara disponivel em:

```text
http://localhost:3000
```

A interface para editar resources fica em:

```text
http://localhost:3000/admin/
```

Ao criar um resource, informe a tabela Oracle e use `Mapear`. A GUI consulta `USER_TAB_COLUMNS`, preenche `columns`, marca colunas escalares como `sortableColumns` e `filterableColumns`, e escolhe `ID` como ordenacao padrao quando existir.

A conexao Oracle e aberta sob demanda. Assim a GUI consegue subir mesmo se o banco ainda nao estiver disponivel; o botao `Mapear` e a rota `/api/:resource` retornam erro amigavel enquanto a conexao nao estiver pronta.

## Docker em Producao

A imagem de producao inclui Oracle Instant Client e usa `oracledb` em thick mode com `initOracleClient()`. O Oracle Database nao sobe no Compose; informe um banco externo em `ORACLE_CONNECT_STRING`.

Observacao: o pacote `oracle-instantclient-release-26ai-el9` configura o repositorio `instantclient23`; por isso o caminho das bibliotecas no container permanece `/usr/lib/oracle/23/client64/lib`.

Build da imagem:

```bash
docker build -t sinter-mega-rest:prod .
```

Executar com `docker run`:

```bash
docker run -d --name sinter-mega-rest \
  --env-file .env \
  -p 3000:3000 \
  -v sinter-mega-resources:/app/data \
  sinter-mega-rest:prod
```

Executar com Docker Compose:

```bash
cp .env.example .env
# edite .env e informe ORACLE_USER, ORACLE_PASSWORD e ORACLE_CONNECT_STRING
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
API_HOST_PORT=3000
```

`API_HOST_PORT` controla a porta publicada no host pelo Compose. `PORT`, `ORACLE_CLIENT_LIB_DIR` e `TNS_ADMIN` sao defaults do container usados pela imagem; no Compose, eles sao fixados intencionalmente para a porta interna e os caminhos Linux do container. Editar `ORACLE_CLIENT_LIB_DIR` ou `TNS_ADMIN` no `.env` nao substitui esses valores no Compose sem mudar tambem o `docker-compose.yml`.

Para ambientes com `tnsnames.ora`, `sqlnet.ora` ou wallet, monte os arquivos no diretorio configurado em `TNS_ADMIN`:

```yaml
services:
  api:
    volumes:
      - resources-data:/app/data
      - ./oracle-network-admin:/opt/oracle/network/admin:ro
```

Para `tnsnames.ora`, use o alias como `ORACLE_CONNECT_STRING`. Para wallet, monte o diretorio completo de wallet/config como read-only.

Nao coloque wallets, chaves ou arquivos `.env` no contexto de build. O `.dockerignore` exclui `oracle-network-admin/`, `.env*` (exceto `.env.example`) e padroes comuns de certificados/chaves.

O Compose monta um volume em `/app/data` para preservar `data/resources.json`, que pode ser alterado pela GUI admin. A imagem mantem uma copia inicial em `/app/seed/resources.json` e copia esse arquivo para `/app/data/resources.json` apenas quando ele ainda nao existe.

O healthcheck usa apenas `GET /health`; ele valida que a API esta respondendo, sem exigir conexao ativa com Oracle.

## Resources Disponiveis

Os resources permitidos ficam em `data/resources.json` e podem ser editados pela GUI em `/admin/`.

```js
produtos -> tabela PRODUTOS
clientes -> tabela CLIENTES
```

A rota `GET /api/:resource` nao acessa qualquer tabela livremente. Se o resource nao existir nessa configuracao, a API retorna `404`.

Endpoint usado pela GUI para mapear colunas:

```http
GET /admin/api/tables/PRODUTOS/columns
```

Resposta:

```json
{
  "table": "PRODUTOS",
  "columns": [
    { "name": "ID", "dataType": "NUMBER" },
    { "name": "NOME", "dataType": "VARCHAR2" }
  ]
}
```

## Exemplos HTTP

Listar produtos:

```bash
curl "http://localhost:3000/api/produtos"
```

Paginar produtos:

```bash
curl "http://localhost:3000/api/produtos?page=1&limit=20"
```

Ordenar produtos por nome:

```bash
curl "http://localhost:3000/api/produtos?sort=NOME&order=asc"
```

Filtrar produtos:

```bash
curl "http://localhost:3000/api/produtos?NOME=Notebook%20Pro&STATUS=ATIVO"
```

Filtrar produtos por varios valores no mesmo campo:

```bash
curl "http://localhost:3000/api/produtos?STATUS=ATIVO&STATUS=PENDENTE"
```

Quando o mesmo filtro aparece mais de uma vez, a API usa `IN`. Valores do mesmo campo funcionam como `OR`; campos diferentes continuam combinados com `AND`.

Filtrar produtos por varios status e outra coluna:

```bash
curl "http://localhost:3000/api/produtos?STATUS=ATIVO&STATUS=PENDENTE&NOME=Notebook%20Pro"
```

Listar clientes paginados:

```bash
curl "http://localhost:3000/api/clientes?page=1&limit=10"
```

Filtrar e ordenar clientes:

```bash
curl "http://localhost:3000/api/clientes?STATUS=ATIVO&sort=NOME&order=desc"
```

Resposta esperada:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

## Exemplos de SQL Gerado

Consulta paginada:

```sql
SELECT "ID", "NOME", "STATUS", "PRECO", "CREATED_AT"
FROM "PRODUTOS"
ORDER BY "NOME" ASC
OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
```

Binds:

```json
{
  "p_offset": 0,
  "p_limit": 20
}
```

Consulta com filtros:

```sql
SELECT "ID", "NOME", "STATUS", "PRECO", "CREATED_AT"
FROM "PRODUTOS"
WHERE "NOME" = :b1 AND "STATUS" = :b2
ORDER BY "ID" ASC
OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
```

Binds:

```json
{
  "b1": "Notebook Pro",
  "b2": "ATIVO",
  "p_offset": 0,
  "p_limit": 20
}
```

Consulta com varios valores no mesmo filtro:

```sql
SELECT "ID", "NOME", "STATUS", "PRECO", "CREATED_AT"
FROM "PRODUTOS"
WHERE "STATUS" IN (:b1, :b2) AND "NOME" = :b3
ORDER BY "ID" ASC
OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
```

Binds:

```json
{
  "b1": "ATIVO",
  "b2": "PENDENTE",
  "b3": "Notebook Pro",
  "p_offset": 0,
  "p_limit": 20
}
```

Total para paginacao:

```sql
SELECT COUNT(*) AS TOTAL
FROM "PRODUTOS"
WHERE "NOME" = :b1 AND "STATUS" = :b2
```

## Cuidados de Seguranca

- Valores de filtros, `limit` e `offset` usam bind variables do Oracle, como `:b1`, `:p_limit` e `:p_offset`.
- Tabelas e colunas nunca vem livres da URL: precisam existir em `data/resources.json`.
- `sort`, `order` e filtros desconhecidos retornam `400` quando nao estao na whitelist.
- O nome do resource da URL so seleciona uma configuracao permitida, nao uma tabela arbitraria.
- Autenticacao nao faz parte deste MVP, mas o ponto natural para JWT/API Key esta comentado no controller.
