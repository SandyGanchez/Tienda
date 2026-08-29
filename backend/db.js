const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl:
        process.env.PGSSLMODE === 'disable' || connectionString.includes('localhost')
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    }
  : {
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      user: process.env.DB_USER || process.env.PGUSER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
      database: process.env.DB_NAME || process.env.PGDATABASE || 'tienda',
      port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Error inesperado en el cliente inactivo de PostgreSQL:', err);
});

function crearFilaProxy(row) {
  if (!row || typeof row !== 'object') return row;

  const lowerMap = {};
  for (const key of Object.keys(row)) {
    lowerMap[key.toLowerCase()] = key;
  }

  return new Proxy(row, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver);
      }
      if (prop in target) {
        return target[prop];
      }
      const lowerProp = prop.toLowerCase();
      if (lowerProp in lowerMap) {
        return target[lowerMap[lowerProp]];
      }
      return undefined;
    },
    has(target, prop) {
      if (typeof prop !== 'string') {
        return Reflect.has(target, prop);
      }
      return prop in target || prop.toLowerCase() in lowerMap;
    },
  });
}

function convertirSqlMySQLParaPg(sql) {
  let paramCount = 1;
  let converted = sql.replace(/\?/g, () => `$${paramCount++}`);

  converted = converted.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  const trimmed = converted.trim();
  const isInsert = /^INSERT\s+INTO/i.test(trimmed);
  if (isInsert && !/RETURNING/i.test(trimmed)) {
    converted = `${converted} RETURNING *`;
  }
  return converted;
}

function adaptarResultado(pgResult) {
  const firstRow = pgResult.rows?.[0];
  let insertId = null;
  if (firstRow) {
    const idKey = Object.keys(firstRow).find((k) => k.toLowerCase().startsWith('id') || k.toLowerCase().endsWith('id'));
    insertId = idKey ? Number(firstRow[idKey]) : null;
  }
  return {
    insertId,
    affectedRows: pgResult.rowCount ?? 0,
    rowCount: pgResult.rowCount ?? 0,
    rows: (pgResult.rows || []).map(crearFilaProxy),
  };
}

const db = {
  async query(sql, params = []) {
    const pgSql = convertirSqlMySQLParaPg(sql);
    const res = await pool.query(pgSql, params);
    const adapted = adaptarResultado(res);
    const rows = (res.rows || []).map(crearFilaProxy);
    return [rows, adapted];
  },

  async getConnection() {
    const client = await pool.connect();
    let inTransaction = false;

    return {
      async beginTransaction() {
        await client.query('BEGIN');
        inTransaction = true;
      },
      async commit() {
        await client.query('COMMIT');
        inTransaction = false;
      },
      async rollback() {
        if (inTransaction) {
          await client.query('ROLLBACK');
          inTransaction = false;
        }
      },
      async query(sql, params = []) {
        const pgSql = convertirSqlMySQLParaPg(sql);
        const res = await client.query(pgSql, params);
        const adapted = adaptarResultado(res);
        const rows = (res.rows || []).map(crearFilaProxy);
        return [rows, adapted];
      },
      release() {
        if (inTransaction) {
          client.query('ROLLBACK').finally(() => client.release());
        } else {
          client.release();
        }
      },
    };
  },

  pool,
};

module.exports = db;
