const db = require('../db');

const RESERVED_QUERY_PARAMS = new Set(['page', 'limit', 'sort', 'order']);
const MAX_LIMIT = 100;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePagination(query) {
  const page = parsePositiveInteger(query.page, 1);
  const requestedLimit = parsePositiveInteger(query.limit, 20);
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function normalizeSort(query, resourceConfig) {
  const requestedSort = String(query.sort || resourceConfig.defaultSort).toUpperCase();
  if (!resourceConfig.sortableColumns.includes(requestedSort)) {
    throw badRequest(`Coluna de ordenacao nao permitida: ${requestedSort}`);
  }

  const requestedOrder = String(query.order || 'asc').toLowerCase();
  if (!['asc', 'desc'].includes(requestedOrder)) {
    throw badRequest('Parametro order deve ser asc ou desc.');
  }

  return {
    sort: requestedSort,
    order: requestedOrder.toUpperCase(),
  };
}

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

async function listResource(resourceConfig, query) {
  const { page, limit, offset } = normalizePagination(query);
  const { sort, order } = normalizeSort(query, resourceConfig);
  const { whereSql, binds } = buildFilters(query, resourceConfig);

  const tableSql = quoteIdentifier(resourceConfig.table);
  const columnsSql = resourceConfig.columns.map(quoteIdentifier).join(', ');
  const sortSql = quoteIdentifier(sort);

  const countSql = `SELECT COUNT(*) AS TOTAL FROM ${tableSql} ${whereSql}`;
  const dataSql = `
    SELECT ${columnsSql}
    FROM ${tableSql}
    ${whereSql}
    ORDER BY ${sortSql} ${order}
    OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
  `;

  const [countResult, dataResult] = await Promise.all([
    db.execute(countSql, binds),
    db.execute(dataSql, { ...binds, p_offset: offset, p_limit: limit }),
  ]);

  const total = countResult.rows[0]?.TOTAL || 0;

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  buildFilters,
  listResource,
};
