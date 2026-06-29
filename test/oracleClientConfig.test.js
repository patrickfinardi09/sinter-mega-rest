const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildOracleClientOptions } = require('../src/oracleClientConfig');

test('buildOracleClientOptions returns undefined when ORACLE_CLIENT_LIB_DIR is not set', () => {
  assert.equal(buildOracleClientOptions({}), undefined);
});

test('buildOracleClientOptions returns undefined when ORACLE_CLIENT_LIB_DIR is blank', () => {
  assert.equal(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '   ' }), undefined);
});

test('buildOracleClientOptions returns libDir when ORACLE_CLIENT_LIB_DIR is set', () => {
  assert.deepEqual(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '/usr/lib/oracle/23/client64/lib' }), {
    libDir: '/usr/lib/oracle/23/client64/lib',
  });
});

test('buildOracleClientOptions trims ORACLE_CLIENT_LIB_DIR', () => {
  assert.deepEqual(buildOracleClientOptions({ ORACLE_CLIENT_LIB_DIR: '  /opt/oracle/instantclient  ' }), {
    libDir: '/opt/oracle/instantclient',
  });
});
