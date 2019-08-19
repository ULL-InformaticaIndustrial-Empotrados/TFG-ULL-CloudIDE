
const PythonShell = require('python-shell');

const logger = require('./logger.js').child({ label: 'restauraservicio' });

logger.info('Comienza restauraservicio');

const db = require('./database.js');

function pythonShellPromise(command, options) {
  return new Promise((resolve, reject) => {
    PythonShell.run(command, options, (err, results) => {
      if (err) reject(err);
      resolve(results);
    });
  });
}

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
  await connection.release();
  await pool.end();

  const options = {
    mode: 'text',
    scriptPath: './ovirtpython',
  };

  const results = await pythonShellPromise('stop_and_remove_all_vm.py', options);
  // results is an array consisting of messages collected during execution
  logger.info(`results: ${results}`);
  logger.info('Finaliza restauraservicio');
}

restaura();
