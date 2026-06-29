# Multiplos Valores em Query Params Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir filtros com varios valores no mesmo campo usando query params repetidos, mantendo compatibilidade com filtros simples.

**Architecture:** A mudanca fica concentrada em `src/services/resourceService.js`, onde os filtros sao normalizados e convertidos em SQL com bind variables. Parametros repetidos chegam do Express como arrays em `req.query`; arrays com um valor geram `=`, arrays com dois ou mais valores geram `IN`, e campos diferentes continuam unidos com `AND`.

**Tech Stack:** Node.js CommonJS, Express 4, driver `oracledb`, runner nativo `node:test`.

---

## Nota sobre versionamento

Este workspace nao esta dentro de um repositorio Git: `git status --short` retorna `fatal: not a git repository`. Por isso, este plano usa checkpoints de verificacao em vez de passos de commit. Se a implementacao for executada dentro de um repositorio Git, crie commits pequenos ao final de cada tarefa com os arquivos citados.

## File Structure

- Modify: `package.json`
  - Adicionar script `test` usando o runner nativo do Node.
- Create: `test/resourceService.test.js`
  - Cobrir a montagem de filtros sem depender de Oracle.
- Modify: `src/services/resourceService.js`
  - Aceitar arrays de valores simples em filtros.
  - Gerar `IN (:b1, :b2, ...)` para filtros multi-valor.
  - Exportar `buildFilters` para teste unitario.
- Modify: `README.md`
  - Documentar query params repetidos, regra `OR` no mesmo campo e `AND` entre campos.

### Task 1: Add Failing Unit Tests

**Files:**
- Modify: `package.json:7-10`
- Create: `test/resourceService.test.js`

- [ ] **Step 1: Add the test script**

Change the `scripts` block in `package.json` to:

```json
"scripts": {
  "dev": "node --watch src/server.js",
  "start": "node src/server.js",
  "test": "node --test"
}
```

- [ ] **Step 2: Create the failing tests**

Create `test/resourceService.test.js` with:

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildFilters } = require('../src/services/resourceService');

const resourceConfig = {
  filterableColumns: ['NOME', 'STATUS', 'UF_ST_SIGLA'],
};

test('buildFilters uses equality for one simple value', () => {
  const result = buildFilters({ STATUS: 'ATIVO' }, resourceConfig);

  assert.deepEqual(result, {
    whereSql: 'WHERE "STATUS" = :b1',
    binds: {
      b1: 'ATIVO',
    },
  });
});

test('buildFilters uses IN for repeated values in the same field', () => {
  const result = buildFilters({ STATUS: ['ATIVO', 'PENDENTE'] }, resourceConfig);

  assert.deepEqual(result, {
    whereSql: 'WHERE "STATUS" IN (:b1, :b2)',
    binds: {
      b1: 'ATIVO',
      b2: 'PENDENTE',
    },
  });
});

test('buildFilters combines repeated values in one field with another field using AND', () => {
  const result = buildFilters(
    {
      UF_ST_SIGLA: ['SP', 'RJ'],
      STATUS: 'ATIVO',
    },
    resourceConfig
  );

  assert.deepEqual(result, {
    whereSql: 'WHERE "UF_ST_SIGLA" IN (:b1, :b2) AND "STATUS" = :b3',
    binds: {
      b1: 'SP',
      b2: 'RJ',
      b3: 'ATIVO',
    },
  });
});

test('buildFilters ignores reserved query params', () => {
  const result = buildFilters(
    {
      page: '2',
      limit: '10',
      sort: 'NOME',
      order: 'desc',
      STATUS: 'ATIVO',
    },
    resourceConfig
  );

  assert.deepEqual(result, {
    whereSql: 'WHERE "STATUS" = :b1',
    binds: {
      b1: 'ATIVO',
    },
  });
});

test('buildFilters rejects filters outside filterableColumns', () => {
  assert.throws(
    () => buildFilters({ COLUNA_INVALIDA: '1' }, resourceConfig),
    (error) => error.statusCode === 400 && error.message === 'Filtro nao permitido: COLUNA_INVALIDA'
  );
});

test('buildFilters rejects object filter values', () => {
  assert.throws(
    () => buildFilters({ STATUS: { eq: 'ATIVO' } }, resourceConfig),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'Filtro deve possuir apenas valores simples: STATUS'
  );
});

test('buildFilters rejects arrays containing object values', () => {
  assert.throws(
    () => buildFilters({ STATUS: ['ATIVO', { value: 'PENDENTE' }] }, resourceConfig),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'Filtro deve possuir apenas valores simples: STATUS'
  );
});

test('buildFilters rejects empty arrays', () => {
  assert.throws(
    () => buildFilters({ STATUS: [] }, resourceConfig),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'Filtro deve possuir pelo menos um valor: STATUS'
  );
});
```

- [ ] **Step 3: Run tests and verify they fail for the expected reason**

Run:

```bash
npm test
```

Expected: FAIL. At least one test should fail because `buildFilters` is not exported yet, with a message similar to:

```text
TypeError: buildFilters is not a function
```

### Task 2: Implement Multi-Value Filters

**Files:**
- Modify: `src/services/resourceService.js:50-80`
- Modify: `src/services/resourceService.js:119-121`
- Test: `test/resourceService.test.js`

- [ ] **Step 1: Replace single-value filter normalization**

In `src/services/resourceService.js`, replace the current `normalizeFilterValue` function with:

```js
function normalizeSingleFilterValue(value, key) {
  if (value !== null && typeof value === 'object') {
    throw badRequest(`Filtro deve possuir apenas valores simples: ${key}`);
  }

  return value;
}

function normalizeFilterValues(value, key) {
  if (!Array.isArray(value)) {
    return [normalizeSingleFilterValue(value, key)];
  }

  if (!value.length) {
    throw badRequest(`Filtro deve possuir pelo menos um valor: ${key}`);
  }

  return value.map((item) => normalizeSingleFilterValue(item, key));
}

function nextBindName(binds) {
  return `b${Object.keys(binds).length + 1}`;
}
```

- [ ] **Step 2: Replace filter SQL building**

In `src/services/resourceService.js`, replace the current `buildFilters` function with:

```js
function buildFilters(query, resourceConfig) {
  const clauses = [];
  const binds = {};

  Object.entries(query).forEach(([key, value]) => {
    if (RESERVED_QUERY_PARAMS.has(key.toLowerCase())) {
      return;
    }

    const column = key.toUpperCase();
    if (!resourceConfig.filterableColumns.includes(column)) {
      throw badRequest(`Filtro nao permitido: ${key}`);
    }

    const values = normalizeFilterValues(value, key);

    if (values.length === 1) {
      const bindName = nextBindName(binds);
      binds[bindName] = values[0];
      clauses.push(`${quoteIdentifier(column)} = :${bindName}`);
      return;
    }

    const bindTokens = values.map((filterValue) => {
      const bindName = nextBindName(binds);
      binds[bindName] = filterValue;
      return `:${bindName}`;
    });

    clauses.push(`${quoteIdentifier(column)} IN (${bindTokens.join(', ')})`);
  });

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    binds,
  };
}
```

- [ ] **Step 3: Export buildFilters for tests**

At the bottom of `src/services/resourceService.js`, replace the export block with:

```js
module.exports = {
  buildFilters,
  listResource,
};
```

- [ ] **Step 4: Run the unit tests**

Run:

```bash
npm test
```

Expected: PASS. The output should report all tests in `test/resourceService.test.js` passing.

### Task 3: Update README Examples

**Files:**
- Modify: `README.md:118-134`
- Modify: `README.md:170-197`
- Test: `npm test`

- [ ] **Step 1: Add HTTP examples for repeated query params**

In `README.md`, after the existing "Filtrar produtos" example, add:

````md
Filtrar produtos por varios valores no mesmo campo:

```bash
curl "http://localhost:3000/api/produtos?STATUS=ATIVO&STATUS=PENDENTE"
```

Quando o mesmo filtro aparece mais de uma vez, a API usa `IN`. Valores do mesmo campo funcionam como `OR`; campos diferentes continuam combinados com `AND`.

Filtrar produtos por varios status e outra coluna:

```bash
curl "http://localhost:3000/api/produtos?STATUS=ATIVO&STATUS=PENDENTE&NOME=Notebook%20Pro"
```
````

- [ ] **Step 2: Add generated SQL example for IN filters**

In `README.md`, after the current "Consulta com filtros" binds example, add:

````md
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
````

- [ ] **Step 3: Run tests after documentation changes**

Run:

```bash
npm test
```

Expected: PASS. Documentation changes should not affect the unit test suite.

### Task 4: Final Verification

**Files:**
- Verify: `package.json`
- Verify: `src/services/resourceService.js`
- Verify: `test/resourceService.test.js`
- Verify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS. All tests should pass.

- [ ] **Step 2: Validate UTF-8 without BOM and corruption markers**

Run in PowerShell:

```powershell
$paths = @(
  'package.json',
  'src\services\resourceService.js',
  'test\resourceService.test.js',
  'README.md'
)

foreach ($path in $paths) {
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
```

Expected: every file prints `HasBom : False` and `HasCorruptionMarker : False`.

- [ ] **Step 3: Review the diff manually**

Run:

```bash
git diff -- package.json src/services/resourceService.js test/resourceService.test.js README.md
```

Expected if running inside a Git repository: diff only includes the test script, filter normalization, multi-value SQL generation, controlled `buildFilters` export, tests, and README examples.

Expected in the current workspace: this command may fail with `fatal: not a git repository`, because the current directory is not a Git repo.
