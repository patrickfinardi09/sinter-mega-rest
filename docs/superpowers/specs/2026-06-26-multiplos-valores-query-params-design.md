# Filtros com multiplos valores por query param

## Contexto

A API `GET /api/:resource` hoje aceita filtros simples por igualdade usando os nomes das colunas liberadas em `filterableColumns`.

Exemplo atual:

```http
GET /api/agentes?UF_ST_SIGLA=SP&AGN_CH_STATUS=A
```

Semantica atual:

```sql
WHERE "UF_ST_SIGLA" = :b1
  AND "AGN_CH_STATUS" = :b2
```

A funcionalidade nova deve permitir varios valores para o mesmo campo mantendo a compatibilidade com o formato atual.

## Decisao de contrato

Usar query params repetidos como formato oficial para varios valores no mesmo campo.

Exemplo:

```http
GET /api/agentes?UF_ST_SIGLA=SP&UF_ST_SIGLA=RJ
```

Semantica:

```sql
WHERE "UF_ST_SIGLA" IN (:b1, :b2)
```

Esse formato segue o padrao mais comum em APIs HTTP e em OpenAPI para arrays em query string com `style: form` e `explode: true`. Ele tambem evita ambiguidade com valores textuais que poderiam conter virgula.

## Regras de filtro

- Um unico valor para um campo continua usando igualdade (`=`).
- Dois ou mais valores para o mesmo campo usam `IN`.
- Valores do mesmo campo representam `OR`.
- Campos diferentes continuam combinados com `AND`.
- Parametros reservados (`page`, `limit`, `sort`, `order`) continuam fora da montagem de filtros.
- Apenas colunas listadas em `filterableColumns` podem ser filtradas.
- Todos os valores de filtro continuam usando bind variables do Oracle.
- Objetos em query params continuam invalidos.

Exemplo combinado:

```http
GET /api/agentes?UF_ST_SIGLA=SP&UF_ST_SIGLA=RJ&AGN_CH_STATUS=A
```

SQL esperado:

```sql
WHERE "UF_ST_SIGLA" IN (:b1, :b2)
  AND "AGN_CH_STATUS" = :b3
```

Binds esperados:

```json
{
  "b1": "SP",
  "b2": "RJ",
  "b3": "A"
}
```

## Arquitetura

A mudanca fica concentrada em `src/services/resourceService.js`, na normalizacao dos filtros e na montagem de `WHERE`.

O controller `src/controllers/resourceController.js` nao precisa mudar, porque ele ja entrega `req.query` ao service. O Express ja transforma parametros repetidos em array no `req.query`, entao o service deve passar a aceitar array de valores simples.

## Comportamento esperado

Filtro simples:

```http
GET /api/agentes?UF_ST_SIGLA=SP
```

gera:

```sql
"UF_ST_SIGLA" = :b1
```

Filtro multi-valor:

```http
GET /api/agentes?UF_ST_SIGLA=SP&UF_ST_SIGLA=RJ
```

gera:

```sql
"UF_ST_SIGLA" IN (:b1, :b2)
```

Filtro multi-valor com outro campo:

```http
GET /api/agentes?UF_ST_SIGLA=SP&UF_ST_SIGLA=RJ&AGN_CH_STATUS=A
```

gera:

```sql
"UF_ST_SIGLA" IN (:b1, :b2) AND "AGN_CH_STATUS" = :b3
```

Filtro em coluna nao permitida:

```http
GET /api/agentes?COLUNA_INVALIDA=1
```

continua retornando `400`.

## Tratamento de erros

Se um filtro vier como objeto, a API deve manter erro `400`.

Se um array de valores contiver algum objeto, a API deve retornar `400` indicando que o filtro deve possuir apenas valores simples.

Arrays vazios nao devem ser gerados pelo parser normal do Express para query params repetidos. Se chegarem por outro caminho, devem ser tratados como filtro invalido para evitar SQL sem valores dentro de `IN`.

## Testes

Como o projeto ainda nao possui framework de testes configurado, o plano de implementacao deve incluir testes unitarios simples para a funcao que monta filtros. Para isso, a funcao de montagem de filtros deve ser exportada de forma controlada ou isolada em um helper testavel.

Cenarios minimos:

- um valor gera `= :b1`;
- dois valores no mesmo campo geram `IN (:b1, :b2)`;
- campos diferentes geram clausulas combinadas com `AND`;
- coluna fora de `filterableColumns` gera erro `400`;
- array contendo objeto gera erro `400`;
- parametros reservados continuam ignorados pelos filtros.

## Documentacao

Atualizar o `README.md` com:

- exemplo de filtro simples mantido;
- exemplo de filtro com query params repetidos;
- explicacao curta da regra `OR` dentro do mesmo campo e `AND` entre campos;
- exemplo de SQL gerado com `IN` e bind variables.
