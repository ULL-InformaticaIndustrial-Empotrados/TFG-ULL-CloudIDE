const mysql = require('promise-mysql');
const CREDS = require('./creds');
const config = require('./config.json');
const logger = require('./logger.js').child({ label: 'database' });

async function creaPool() {
  const pool = await mysql.createPool({
    host: config.host_bbdd_mysql,
    user: CREDS.user_bbdd_mysql,
    password: CREDS.password_bbdd_mysql,
    database: config.database_bbdd_mysql,
    // debug : true,
    acquireTimeout: 60 * 60 * 1000,
    connectTimeout: 60 * 60 * 1000,
    timeout: 60 * 60 * 1000,
    connectionLimit: 5,
    queueLimit: 0,
  });

  logger.debug('creado Pool conexiones MySQL');

  pool.on('release', (connection) => {
    logger.debug(`Connection MySQL "${connection.threadId}" released`);
  });

  return pool;
}

module.exports = {
  pool: creaPool(),
  bloqueoTablas: `LOCK TABLES
    VMS WRITE,
    VMS as v1 READ,
    Ovirt_Pendientes_Up_AddStart WRITE,
    Ovirt_Pendientes_Up_AddStart as ovpuas READ,
    Ultima_conexion WRITE,
    Ultima_conexion as uc READ,
    Eliminar_servicio_usuario WRITE,
    Eliminar_servicio_usuario as esu READ,
    Eliminar_servicio WRITE,
    Eliminar_servicio as es READ,
    Servicios WRITE,
    Servicios as s1 READ,
    Matriculados WRITE,
    Matriculados as m1 READ,
    Ovirt WRITE, Ovirt as ov READ,
    Ovirt_Pendientes WRITE,
    Ovirt_Pendientes as ovp READ,
    Banco_ip WRITE,
    Banco_ip as bip READ,
    Firewall WRITE,
    Firewall as f1 READ,
    Pendientes WRITE,
    Pendientes as p1 READ,
    Asignaciones WRITE,
    Asignaciones as a1 READ,
    Cola WRITE, Cola as c1 READ
    `,
  desbloqueoTablas: 'UNLOCK TABLES'
};
