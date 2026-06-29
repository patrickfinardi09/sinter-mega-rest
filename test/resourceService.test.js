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
