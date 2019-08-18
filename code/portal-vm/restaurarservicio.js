
const PythonShell = require('python-shell');
const db = require('./database.js');
const logger = require('./logger.js');

async function restaura() {
  const pool = await db.pool;
  // logger.info(`Tenemos pool: ${pool.constructor.name}`);
  logger.info(`Tenemos pool: ${pool.constructor.name}`);
  // console.log(`Tenemos pool: ${JSON.stringify(pool, null, 2)}`);
  const connection = await pool.getConnection();
  logger.info(`Tenemos connection: ${connection.constructor.name}`);
  let sentencia;
  sentencia = 'TRUNCATE Cola';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Firewall';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Pendientes';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE VMS';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Asignaciones';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Servidores';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Ovirt';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Eliminar_servicio';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Eliminar_servicio_usuario';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Ovirt_Pendientes';
  await connection.query(sentencia);
  logger.info(sentencia);
  sentencia = 'TRUNCATE Ovirt_Pendientes_Up_AddStart';
  await connection.query(sentencia);
  logger.info(sentencia);
  logger.info('empty BBDD');
  connection.release();

  const options = {
    mode: 'text',
    scriptPath: './ovirtpython',
  };

  PythonShell.run('stop_and_remove_all_vm.py', options, (err, results) => {
    if (err) throw err;
    // results is an array consisting of messages collected during execution
    logger.info(`results: ${results}`);
    process.exit();
  });
}

restaura();
