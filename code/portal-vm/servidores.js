
const os = require('os');
const SIO = require('socket.io');
const sioC = require('socket.io-client');

const logger = require('./logger.js').child({ label: 'index' });

logger.info('Comienza modulo servidores');

const config = require('./config.json');
const db = require('./database.js');
const firewall = require('./firewall.js');
const functions = require('./functions.js');


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

class Servidores {
  setClientes(cli) {
    this.cli = cli;
  }

  constructor() {
    this.wsServers = new SIO(config.puerto_websocket_servers);
    this.mapSockClientServers = new Map();
    this.cli = undefined;

    this.wsServers.on('connection', (socket) => {
      logger.info('server conectado');

      const cleanAdd = functions.cleanAddress(socket.handshake.address);
      this.mapSockClientServers.set(cleanAdd, socket);

      socket.on('disconnect', async () => {
        const pool = await db.pool;
        const conexion = await pool.getConnection();
        await conexion.query(db.bloqueoTablas);
        await conexion.query(`DELETE FROM Servidores
          WHERE ip_server='${cleanAdd}'`);
        this.mapSockClientServers.get(cleanAdd).disconnect();
        this.mapSockClientServers.delete(cleanAdd);
        logger.info(`server disconnected ${cleanAdd}`);
        await conexion.query('UNLOCK TABLES');
        logger.debug('liberando tablas MySQL');
        await conexion.release();
        Servidores.comprobarservidor();
      });

      socket.on('prueba', (data) => {
        logger.info(`prueba recibida: ${data}`);
      });

      socket.on('enviar-resultado', (data) => {
        logger.info(`enviar resultado: ${data}`);
        if (this.cli.mapUserSocket.get(data.user) !== undefined) {
          this.cli.broadcastClient(data.user, 'resultado', { motivo: data.motivo });
        } else {
          logger.info(`no tengo el usuario ${data.user}`);
        }
      });

      socket.on('enviar-stop', (data) => {
        logger.info(`enviar stop: ${data}`);

        if (this.cli.mapUserSocket.get(data.user) !== undefined) {
          this.cli.broadcastClient(data.user, 'stop', { motivo: data.motivo });
        } else {
          logger.info(`no tengo el usuario '${data.user}'`);
        }
      });

      socket.on('deletednat', (data) => {
        logger.info(`servers deletednat: ${data}`);
        firewall.deletednat(data);
      });

      socket.on('dnatae-eliminarsolo', (data) => {
        logger.info(`servers eliminarsolo: ${data}`);
        firewall.dnatae('eliminarsolo', data.ip_origen, data.ipvm, data.puerto);
      });

      socket.on('añadirsolo', (data) => {
        logger.info(`servers añadirsolo: ${data}`);
        firewall.dnatae('añadirsolo', data.ip_origen, data.ipvm, data.puerto);
      });

      socket.on('añadircomienzo', (data) => {
        logger.info(`servers deletednat: ${data}`);
        firewall.dnatae('añadircomienzo', data.ip_origen, data.ipvm, data.puerto);
      });
    });

    Servidores.comprobarservidor();

    setInterval(Servidores.comprobarservidor, 600000);
  }

  broadcastServers(evento, data) {
    logger.info('Enviando broadcastServers');

    this.mapSockClientServers.forEach((value) => {
      value.emit(evento, data);
    });

    this.wsServers.sockets.emit(evento, data);
  }


  static async comprobarservidor() {
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


  async configuraServidor(itemServidor) {
    const ipServer = itemServidor.ip_server;
    const sockToServer = sioC(`http://${ipServer}:${config.puerto_websocket_servers}`, {
      reconnection: true,
      // reconnectionDelay: 0,
      reconnectionDelay: 100,
    });
    this.mapSockClientServers.set(ipServer, sockToServer);

    sockToServer.on('disconnect', async () => {
      const pool = await db.pool;
      const conexion = await pool.getConnection();
      await conexion.query(db.bloqueoTablas);
      await conexion.query(`DELETE FROM Servidores WHERE ip_server='${ipServer}'`);
      sockToServer.disconnect();
      this.mapSockClientServers.delete(ipServer);
      logger.info('server disconnected');
      await conexion.query('UNLOCK TABLES');
      logger.debug('liberando tablas MySQL');

      await conexion.release();
      Servidores.comprobarservidor();
    });

    sockToServer.on('prueba', (data) => {
      logger.debug(`prueba recibida: ${data}`);
    });

    sockToServer.on('enviar-resultado', (data) => {
      logger.info('enviar resultado');
      if (this.cli.mapUserSocket.get(data.user) !== undefined) {
        this.cli.broadcastClient(data.user, 'resultado', { motivo: data.motivo });
      }
    });

    sockToServer.on('enviar-stop', (data) => {
      logger.info('enviar stopp');
      if (this.cli.mapUserSocket.get(data.user) !== undefined) {
        this.cli.broadcastClient(data.user, 'stop', { motivo: data.motivo });
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
  async conectaDemasServidores() {
    try {
      const addresses = getiplocal();
      const pool = await db.pool;
      const conexion = await pool.getConnection();
      const servers = await conexion.query(`SELECT * FROM Servidores
        WHERE ip_server<>'${addresses[1]}'`);
      await conexion.release();
      await Promise.all(servers.map(this.configuraServidor));
    } catch (err) {
      logger.warn(`Error conectando con los demás servidores: ${err}`);
    }
  }
}

module.exports = Servidores;
