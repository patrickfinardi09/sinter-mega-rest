const db = require('../db');
const { normalizeOracleIdentifier } = require('../resources');

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

async function listTableColumns(tableName) {
  if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECT_STRING) {
    throw serviceUnavailable('Configure ORACLE_USER, ORACLE_PASSWORD e ORACLE_CONNECT_STRING no .env para mapear colunas.');
  }

  const table = normalizeOracleIdentifier(tableName, 'table');
  let result;

  try {
    result = await db.execute(
      `
        SELECT
            OWNER,
            COLUMN_NAME,
            DATA_TYPE
        FROM
            ALL_TAB_COLUMNS
        WHERE
            TABLE_NAME = :p_table_name
        ORDER BY
            COLUMN_ID`,
      { p_table_name: table },
    );
  } catch (error) {
    throw serviceUnavailable(`Nao foi possivel consultar metadata no Oracle: ${error.message}`);
  }

  const columns = result.rows.map((row) => ({
    name: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
  }));

  if (!columns.length) {
    throw notFound(`Tabela nao encontrada no schema atual: ${table}`);
  }

  return {
    table,
    columns,
  };
}

module.exports = {
  listTableColumns,
};
