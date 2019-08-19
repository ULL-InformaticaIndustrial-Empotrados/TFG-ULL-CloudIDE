const logger = require('./logger.js').child({ label: 'pruebaSQL' });

logger.info('Comienza pruebaSQL');

const db = require('./database.js');

async function añade(consulta) {
  logger.info(`Ejecutando consulta SQL: "${consulta}"`);
  const pool = await db.pool;
  const connection = await pool.getConnection();
  try {
    const result = await connection.query(consulta);
    logger.info(`RESULTADO consulta: ${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    logger.error(`ERROR consulta: ${JSON.stringify(error, null, 2)}`);
  }
  await connection.release();
  await pool.end();
}

if (process.argv.length < 3) {
  logger.error('No se ha pasado sentencia SQL');
} else {
  const sentencia = process.argv[2];
  añade(sentencia);
}
