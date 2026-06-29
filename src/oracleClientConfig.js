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
