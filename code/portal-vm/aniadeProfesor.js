const logger = require('./logger.js').child({ label: 'aniadeProfesor' });

logger.info('Comienza aniadeProfesor');

const db = require('./database.js');

async function añade(user) {
  logger.info(`Añadiendo profesor: "${user}"`);
  const pool = await db.pool;
  const connection = await pool.getConnection();
  const consulta = `INSERT INTO Profesores (usuario) VALUES ('${user}')`;
  logger.debug(`Consulta de inserción: "${consulta}"`);
  try {
    const result = await connection.query(consulta);
    logger.info(`RESULTADO consulta: ${JSON.stringify(result, null, 2)}`);
  //   if (fields)
  //     console.log(`FIELD consulta: ${JSON.stringify(fields, null, 2)}`);
  // });
  } catch (error) {
    logger.error(`ERROR consulta: ${JSON.stringify(error, null, 2)}`);
  }
  await connection.release();
  await pool.end();
}

if (process.argv.length < 3) {
  logger.error('No se ha pasado nombre de usuario');
} else {
  const user = process.argv[2];
  añade(user);
}
