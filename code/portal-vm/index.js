const sio = require('socket.io');
const sioC = require('socket.io-client');

const logger = require('./logger.js').child({ label: 'index' });

logger.info('Comienza la aplicacion portal');

const config = require('./config.json');
const functions = require('./functions.js');
const firewall = require('./firewall.js');
const db = require('./database.js');

// async = require("async");
const ovirt = require('./ovirt.js');
const sesion = require('./sesion.js');

const serv = require('./servidores.js');
const cli = require('./clientes.js');
const vms = require('./vms.js');
const websrv = require('./webserver.js');

firewall.inicializar(); // borramos iptables anteriores

// Funcion-promesa para determinar rol del usuario
async function getRoll(user) {
  const consulta = `SELECT count(*) as total FROM Profesores WHERE usuario='${user}'`;
  logger.debug(`Obetemos roll con consulta: "${consulta}"`);
  try {
    const pool = await db.pool;
    const result = await pool.query(consulta);
    logger.debug(`Resultado consulta roll: ${JSON.stringify(result, null, 2)}`);
    if (result[0].total === 1) return 'profesor';
  } catch (error) {
    logger.warn(`Error al consultar roll: ${error}`);
  }
  return 'alumno';
}

const n = config.numero_max_serverxuser;
// const maxusers = config.numero_max_users;
sesion.createsession(app, cli.wsClient); // creamos la sesion
// AUTENTICACION POR CAS ULL
const CASAuthentication = require('./cas-authentication.js');

// Create a new instance of CASAuthentication.
const cas = new CASAuthentication({
  cas_url: 'https://login.ull.es/cas-1',
  service_url: 'http://cloudide.iaas.ull.es',
  session_info: 'cas_userinfo',
  destroy_session: false,
});


// //////////////////"/ Firewall

firewall.firewall();

//  ///////////////////



//WEBSOCKET////////////////////////////





////////////////////////////////////////


