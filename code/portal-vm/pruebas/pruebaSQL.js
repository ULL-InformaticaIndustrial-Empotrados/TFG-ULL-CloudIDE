const logger = require('../logger.js').child({ module: 'pruebaSQL' });

logger.info('Comienza pruebaSQL');

const db = require('../database.js');

async function main() {
  if (process.argv.length < 3) {
    logger.error('No se ha pasado sentencia SQL');
  } else {
    const pool = await db.pool;
    const connection = await pool.getConnection();
    let argAct = 2;
    while (argAct < process.argv.length) {
      const sentencia = process.argv[argAct];
      logger.info(`Ejecutando consulta SQL: "${sentencia}"`);
      try {
        const result = await connection.query(sentencia);
        logger.info(`RESULTADO consulta: ${JSON.stringify(result, null, 2)}`);
      } catch (error) {
        logger.error(`ERROR consulta: ${JSON.stringify(error, null, 2)}`);
      }
      argAct += 1;
    }
    await connection.release();
    await pool.end();
  }
}

main();
