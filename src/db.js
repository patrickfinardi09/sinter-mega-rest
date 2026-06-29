const oracledb = require("oracledb");
require("dotenv").config();

const { buildOracleClientOptions } = require("./oracleClientConfig");

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const oracleClientOptions = buildOracleClientOptions();
if (oracleClientOptions) {
  oracledb.initOracleClient(oracleClientOptions);
} else {
  oracledb.initOracleClient();
}

let pool;

async function initPool() {
  if (pool) {
    return pool;
  }

  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
    sessionCallback: initSession,
  });

  return pool;
}

async function execute(sql, binds = {}, options = {}) {
  const activePool = await initPool();
  const connection = await activePool.getConnection();

  try {
    return await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
  } finally {
    await connection.close();
  }
}

async function closePool() {
  if (!pool) {
    return;
  }

  await pool.close(10);
  pool = null;
}

async function initSession(connection, requestedTag, cb) {
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${process.env.ORACLE_DEFAULT_SCHEMA}`,
    );
    cb();
  } catch (err) {
    cb(err);
  }
}

module.exports = {
  closePool,
  execute,
  initPool,
  oracledb,
};
