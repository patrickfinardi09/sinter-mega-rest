const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const resourcesFile = path.join(dataDir, 'resources.json');

const RESOURCE_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
const ORACLE_IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const defaultResources = {
  produtos: {
    table: 'PRODUTOS',
    defaultSort: 'ID',
    columns: ['ID', 'NOME', 'STATUS', 'PRECO', 'CREATED_AT'],
    sortableColumns: ['ID', 'NOME', 'STATUS', 'PRECO', 'CREATED_AT'],
    filterableColumns: ['ID', 'NOME', 'STATUS', 'PRECO'],
  },
  clientes: {
    table: 'CLIENTES',
    defaultSort: 'ID',
    columns: ['ID', 'NOME', 'EMAIL', 'STATUS', 'CREATED_AT'],
    sortableColumns: ['ID', 'NOME', 'EMAIL', 'STATUS', 'CREATED_AT'],
    filterableColumns: ['ID', 'NOME', 'EMAIL', 'STATUS'],
  },
};

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function ensureResourcesFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(resourcesFile)) {
    fs.writeFileSync(resourcesFile, JSON.stringify(defaultResources, null, 2));
  }
}

function readResources() {
  ensureResourcesFile();
  return JSON.parse(fs.readFileSync(resourcesFile, 'utf8'));
}

function writeResources(resources) {
  ensureResourcesFile();
  fs.writeFileSync(resourcesFile, `${JSON.stringify(resources, null, 2)}\n`);
}

function normalizeResourceName(value) {
  const name = String(value || '').trim().toLowerCase();

  if (!RESOURCE_NAME_PATTERN.test(name)) {
    throw badRequest('Resource deve comecar com letra minuscula e conter apenas letras, numeros, _ ou -.');
  }

  return name;
}

function normalizeOracleIdentifier(value, fieldName) {
  const identifier = String(value || '').trim().toUpperCase();

  if (!ORACLE_IDENTIFIER_PATTERN.test(identifier)) {
    throw badRequest(`${fieldName} deve ser um identificador Oracle simples, como PRODUTOS ou NOME.`);
  }

  return identifier;
}

function normalizeIdentifierList(values, fieldName) {
  if (!Array.isArray(values)) {
    throw badRequest(`${fieldName} deve ser uma lista.`);
  }

  return [...new Set(values.map((value) => normalizeOracleIdentifier(value, fieldName)))];
}

function ensureSubset(values, allowedValues, fieldName) {
  values.forEach((value) => {
    if (!allowedValues.includes(value)) {
      throw badRequest(`${fieldName} contem coluna fora de columns: ${value}`);
    }
  });
}

function normalizeResourcePayload(payload) {
  const name = normalizeResourceName(payload.name);
  const table = normalizeOracleIdentifier(payload.table, 'table');
  const columns = normalizeIdentifierList(payload.columns, 'columns');

  if (!columns.length) {
    throw badRequest('Informe pelo menos uma coluna.');
  }

  const sortableColumns = normalizeIdentifierList(payload.sortableColumns || [], 'sortableColumns');
  const filterableColumns = normalizeIdentifierList(payload.filterableColumns || [], 'filterableColumns');
  const defaultSort = normalizeOracleIdentifier(payload.defaultSort || columns[0], 'defaultSort');

  ensureSubset(sortableColumns, columns, 'sortableColumns');
  ensureSubset(filterableColumns, columns, 'filterableColumns');

  if (!columns.includes(defaultSort)) {
    throw badRequest('defaultSort deve existir em columns.');
  }

  if (!sortableColumns.includes(defaultSort)) {
    throw badRequest('defaultSort deve existir em sortableColumns.');
  }

  return {
    name,
    config: {
      table,
      defaultSort,
      columns,
      sortableColumns,
      filterableColumns,
    },
  };
}

function getResources() {
  return readResources();
}

function getResourceConfig(resourceName) {
  const resources = readResources();
  return resources[resourceName] || null;
}

function saveResource(payload) {
  const { name, config } = normalizeResourcePayload(payload);
  const resources = readResources();

  resources[name] = config;
  writeResources(resources);

  return {
    name,
    config,
  };
}

function deleteResource(resourceName) {
  const name = normalizeResourceName(resourceName);
  const resources = readResources();

  if (!resources[name]) {
    return false;
  }

  delete resources[name];
  writeResources(resources);
  return true;
}

module.exports = {
  deleteResource,
  getResourceConfig,
  getResources,
  normalizeOracleIdentifier,
  saveResource,
};
