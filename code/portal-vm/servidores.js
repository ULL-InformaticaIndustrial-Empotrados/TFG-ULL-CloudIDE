
const os = require('os');
const sio = require('socket.io');
const sioC = require('socket.io-client');

const logger = require('./logger.js').child({ label: 'index' });

const config = require('./config.json');
const db = require('./database.js');
const firewall = require('./firewall.js');

const mapSockClientServers = new Map();


function getiplocal() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k of Object.keys(interfaces)) {
    for (const addrAct of Object.keys(interfaces[k])) {
      const { address, family, internal } = interfaces[k][addrAct];
      if (family === 'IPv4' && !internal) {
        addresses.push(address);
        logger.info(`IP local encontrada: "${address}"`);
      }
    }
  }
  return addresses;
}

async function comprobarservidor() {
  // INSERTAR SERVIDOR EN BBDD
  logger.info('Comprobando servidor...');
  try {
    const pool = await db.pool;
    const addresses = getiplocal();

    await pool.query(`INSERT INTO Servidores (ip_server)
      SELECT '${addresses[1]}' FROM dual WHERE NOT EXISTS
      (SELECT * FROM Servidores WHERE ip_server='${addresses[1]}')`);
  } catch (err) {
    logger.warn(`Error comprobando el servidor: "${err}"`);
  }
}

async function configuraServidor(itemServidor) {
  const ipServer = itemServidor.ip_server;
  const sockToServer = sioC(`http://${ipServer}:${config.puerto_websocket_servers}`, {
    reconnection: true,
    // reconnectionDelay: 0,
    reconnectionDelay: 100,
  });
  mapSockClientServers.set(ipServer, sockToServer);

  sockToServer.on('disconnect', async () => {
    const pool = await db.pool;
    const conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);
    await conexion.query(`DELETE FROM Servidores WHERE ip_server='${ipServer}'`);
    sockToServer.disconnect();
    mapSockClientServers.delete(ipServer);
    logger.info('server disconnected');
    await conexion.query('UNLOCK TABLES');
    logger.debug('liberando tablas MySQL');

    await conexion.release();
    comprobarservidor();
  });

  sockToServer.on('prueba', (data) => {
    logger.info('prueba recibida');
  });

  sockToServer.on('enviar-resultado', (data) => {
    logger.info('enviar resultado');
    if (mapUserSocket.get(data.user) !== undefined) {
      broadcastclient(data.user, 'resultado', { motivo: data.motivo });
    }
  });

  sockToServer.on('enviar-stop', (data) => {
    logger.info('enviar stopp');
    if (mapUserSocket.get(data.user) !== undefined) {
      broadcastclient(data.user, 'stop', { motivo: data.motivo });
    }
  });

  sockToServer.on('deletednat', (data) => {
    logger.info('servers deletednat');
    firewall.deletednat(data);
  });

  sockToServer.on('dnatae-eliminarsolo', (data) => {
    logger.info('servers deletednat');
    firewall.dnatae('eliminarsolo', data.ip_origen, data.ipvm, data.puerto);
  });

  sockToServer.on('añadirsolo', (data) => {
    logger.info('servers deletednat');
    firewall.dnatae('añadirsolo', data.ip_origen, data.ipvm, data.puerto);
  });

  sockToServer.on('añadircomienzo', (data) => {
    logger.info('servers deletednat');
    firewall.dnatae('añadircomienzo', data.ip_origen, data.ipvm, data.puerto);
  });
}

// ESTABLECEMOS CONEXION CON LOS DEMÁS SERVIDORES
async function conectaDemasServidores() {
  try {
    const addresses = getiplocal();
    const pool = await db.pool;
    const conexion = await pool.getConnection();
    const servers = await conexion.query(`SELECT * FROM Servidores
      WHERE ip_server<>'${addresses[1]}'`);
    await conexion.release();
    await Promise.all(servers.map(configuraServidor));
  } catch (err) {
    logger.warn(`Error conectando con los demás servidores: ${err}`);
  }
}

comprobarservidor();

setInterval(comprobarservidor, 600000);
