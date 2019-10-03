const SIO = require('socket.io');

const logger = require('./logger.js').child({ module: 'clientes' });

logger.info('Comienza modulo clientes.js');

const config = require('./config.json');
const db = require('./database.js');
const functions = require('./functions.js');
const ovirt = require('./ovirt.js');

class Condicion {
  constructor(msg) {
    this.msg = msg;
  }
}


class Clientes {
  setVMs(vms) {
    this.vms = vms;
  }

  constructor() {
    this.vms = undefined;
    this.mapUserSocket = new Map();
    this.wsClient = new SIO(config.puerto_websocket_clients);

    this.wsClient.on('connection', (socket) => {
      const ip = socket.handshake.address;
      const { user } = socket.session;
      const socketId = socket.id;
      logger.info(`Conexión cliente desde "${ip}" para '${user}'`, {
        user, socketId, ip, accion: 'client_connection',
      });

      if (user) {
        if (this.mapUserSocket.get(user) === undefined) {
          this.mapUserSocket.set(user, new Map());
        }
        const mapUsu = this.mapUserSocket.get(user);
        mapUsu.set(socketId, socket);
        logger.debug(`Usario ${user} tiene ${mapUsu.size} sockets conectados`);
      }

      socket.on('disconnect', () => {
        logger.info(`DESConexión cliente desde "${ip}" para '${user}'`, {
          user, socketId, ip, accion: 'client_disconnect',
        });

        if (user) {
          if (this.mapUserSocket.get(user) !== undefined) {
            const mapUsu = this.mapUserSocket.get(user);
            mapUsu.delete(socketId);
            logger.debug(`tiene conectados a la vez "${mapUsu.size}"`);
            if (mapUsu.size === 0) {
              logger.debug(`no hay mas conexiones del usuario "${user}"`);
              this.mapUserSocket.delete(user);
            }
          }
        }
      });

      socket.on('stopenlace', async (motivo) => {
        if (!user) {
          logger.warn('En stopenlace pero no hay usuario definido');
          return;
        }
        // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
        if (functions.cleanAddress(ip) !== socket.session.ip_origen) {
          const msg = 'Está accediendo desde una ip diferente a la inicial';
          if (this.mapUserSocket.get(user) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.warn(msg);
          return;
        }
        logger.info(`Cliente stopenlace '${user}-${motivo}'`, {
          user, socketId, ip, accion: 'client_stopenlace', motivo,
        });

        let conexion;
        try {
          const pool = await db.pool;
          conexion = await pool.getConnection();
          await conexion.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          if (this.mapUserSocket.get(user) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.error(msg);
          return;
        }
        try {
          const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Matriculados AS m1
            WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if (existeMatriculados <= 0) {
            throw new Condicion('No está matriculado de este servidor');
          }

          const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
            FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
            WHERE usuario='${user}' AND motivo='${motivo}'
            UNION SELECT motivo FROM Eliminar_servicio as es
            WHERE motivo='${motivo}') AS alias`))[0].total;
          if (eliminando > 0) {
            throw new Condicion('No se puede parar, se está eliminando servicio (individual o global)');
          }

          const numPendientes = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE motivo='${motivo}'
            AND usuario='${user}'`))[0].total;
          if (numPendientes > 0) {
            throw new Condicion('No se puede parar, hay solicitud pendiente');
          }

          const results = await conexion.query(`SELECT * FROM Asignaciones AS a1
            WHERE motivo='${motivo}' AND usuario='${user}'`);
          if (results.length <= 0) {
            throw new Condicion('No hay asignación para este usuario y servicio');
          }
          this.vms.mandaParar(conexion, results[0]);
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.mapUserSocket.get(user) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.warn(err.msg);
          } else {
            logger.error(`Error en 'stopenlace' '${user}'-'${motivo}': ${err}`);
          }
        }
        await conexion.query('UNLOCK TABLES');
        await conexion.release();
      });

      socket.on('obtenerenlace', async (motivo) => {
        if (!user) {
          logger.warn('En obtenerenlace pero no hay usuario definido');
          if (this.mapUserSocket.get(user) !== undefined) {
            socket.emit('data-error', { msg: 'Accesso sin iniciar sesión' });
          }
          return;
        }

        // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
        if (functions.cleanAddress(ip) !== socket.session.ip_origen) {
          const msg = 'Está accediendo desde una ip diferente a la inicial';
          if (this.mapUserSocket.get(user) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.warn(msg);
          return;
        }
        logger.info(`Cliente obtenerenlace '${user}-${motivo}'`, {
          user, socketId, ip, accion: 'client_obtenerenlace', motivo,
        });

        let conexion;
        try {
          const pool = await db.pool;
          conexion = await pool.getConnection();
          await conexion.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          if (this.mapUserSocket.get(user) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.error(msg);
          return;
        }
        try {
          const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Matriculados AS m1
            WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if (existeMatriculados <= 0) {
            throw new Condicion('No está matriculado de este servidor');
          }

          const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
            FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
            WHERE usuario='${user}' AND motivo='${motivo}'
            UNION SELECT motivo FROM Eliminar_servicio as es
            WHERE motivo='${motivo}') AS alias`))[0].total;
          if (eliminando > 0) {
            throw new Condicion('No se puede arrancar, se está eliminando servicio (individual o global)');
          }

          const motivototal = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if (motivototal > 0) {
            throw new Condicion('Servicio ya asignado');
          }
          const pendientes1 = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if (pendientes1 > 0) {
            throw new Condicion('Servicio ya pendiente');
          }
          const userEnCola = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Cola AS c1 WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if (userEnCola > 0) {
            throw new Condicion('El servicio ya está en cola');
          }
          const asignasUser = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${user}'`))[0].total;
          const colasUser = (await conexion.query(`SELECT COUNT(*) AS total
              FROM Cola AS c1 WHERE usuario='${user}'`))[0].total;
          const pendientesUserUp = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${user}' AND tipo='up'`))[0].total;

          if ((asignasUser + colasUser + pendientesUserUp) >= config.numero_max_serverxuser) {
            throw new Condicion('Supera el número máximo de servidores');
          }
          await conexion.query(`INSERT INTO Cola (motivo, usuario)
          VALUES ('${motivo}','${user}')`);
          const json = { user, motivo, accion: 'metercola' };
          logger.info(`Inserta cola ${JSON.stringify(json)}`, json);


          // Si el usuario está asignado o pendiente lo mandamos directamente
          //  a esa máquina
          const pendientesUser = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${user}'`))[0].total;
          if ((asignasUser + pendientesUser) > 0) {
            const pip = (await conexion.query(`SELECT ip_vm FROM Pendientes AS p1
                WHERE usuario='${user}'`));
            let ipVM = 0;
            if (pip.length > 0) ipVM = pip[0].ip_vm;
            else {
              ipVM = (await conexion.query(`SELECT ip_vm FROM Asignaciones AS a1
                WHERE usuario='${user}'`))[0].ip_vm;
            }
            logger.debug(`Usuaraio ${user} tiene cosas en máquina ${ipVM}`);
            if (this.vms.mapIpVMS.get(ipVM) === undefined) { // si la vm no esta disponible
              await conexion.query(`DELETE FROM Cola WHERE user='${user}'`);
              throw new Condicion('No se puede obtener el servidor');
            } else {
              await this.vms.mandaUsuarioVM(conexion, user, ipVM);
            }
          } else {
            this.vms.miraCola(conexion);
          }
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.mapUserSocket.get(user) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.warn(err.msg);
          } else {
            logger.error(`Error en 'obtenerenlace' '${user}-${motivo}': ${err}`);
          }
        }
        await conexion.query('UNLOCK TABLES');
        await conexion.release();
        ovirt.ajustaVMArrancadas();
      });
    });
  }

  broadcastClient(user, evento, data) {
    const socks = this.mapUserSocket.get(user);
    if (socks !== undefined) {
      logger.debug(`Enviando cliente ${user}-${data.motivo} '${evento}' num socks ${socks.length}`);
      socks.forEach((value) => {
        value.emit(evento, data);
      });
    } else {
      logger.warn(`No hay socket para cliente ${user}-${JSON.stringify(data)} evento ${evento}`);
    }
  }
}

module.exports = Clientes;
