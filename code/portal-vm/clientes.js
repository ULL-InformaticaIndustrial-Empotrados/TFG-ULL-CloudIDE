const SIO = require('socket.io');

const logger = require('./logger.js').child({ label: 'clientes' });

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
    this.wsClient = new SIO(config.puerto_wsClients);

    this.wsClient.on('connection', (socket) => {
      const usuario = socket.session.user;
      logger.info(`Conexión cliente de "${socket.id}" Con ip "${socket.handshake.address}" para usuario '${usuario}'`);

      if (usuario) {
        if (this.mapUserSocket.get(usuario) === undefined) {
          this.mapUserSocket.set(usuario, new Map());
        }
        const mapUsu = this.mapUserSocket.get(usuario);
        mapUsu.set(socket.id, socket);
        logger.info(`tiene conectados a la vez "${mapUsu.size}"`);
      }

      socket.on('disconnect', () => {
        logger.info(`client disconnected: ${usuario}`);
        if (usuario) {
          if (this.mapUserSocket.get(usuario) !== undefined) {
            const mapUsu = this.mapUserSocket.get(usuario);
            mapUsu.delete(socket.id);
            logger.info(`tiene conectados a la vez "${mapUsu.size}"`);
            if (mapUsu.size === 0) {
              logger.info(`no hay mas conexiones del usuario "${usuario}"`);
              this.mapUserSocket.delete(usuario);
            }
          }
        }
      });

      socket.on('stopenlace', async (motivo) => {
        if (!usuario) {
          logger.warn('En stopenlace pero no hay usuario definido');
          return;
        }
        logger.info(`stopenlace '${usuario}'- '${motivo}'`);
        // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
        if (functions.cleanAddress(socket.handshake.address) !== socket.session.ip_origen) {
          const msg = 'Está accediendo desde una ip diferente a la inicial';
          if (this.mapUserSocket.get(usuario) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.warn(msg);
          return;
        }

        let conexion;
        try {
          const pool = await db.pool;
          conexion = await pool.getConnection();
          await conexion.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          if (this.mapUserSocket.get(usuario) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.error(msg);
          return;
        }
        try {
          const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Matriculados AS m1
            WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
          if (existeMatriculados <= 0) {
            throw new Condicion('No está matriculado de este servidor');
          }

          const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
            FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
            WHERE usuario='${usuario}' AND motivo='${motivo}'
            UNION SELECT motivo FROM Eliminar_servicio as es
            WHERE motivo='${motivo}') AS alias`))[0].total;
          if (eliminando > 0) {
            throw new Condicion('No se puede parar, se está eliminando servicio (individual o global)');
          }

          const numPendientes = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE motivo='${motivo}'
            AND usuario='${usuario}'`))[0].total;
          if (numPendientes > 0) {
            throw new Condicion('No se puede parar, hay solicitud pendiente');
          }

          const results = await conexion.query(`SELECT * FROM Asignaciones AS a1
            WHERE motivo='${motivo}' AND usuario='${usuario}'`);
          if (results.length <= 0) {
            throw new Condicion('No hay asignación para este usuario y servicio');
          }
          const ipVM = results[0].ip_vm;
          if (this.vms.mapIpVMS.get(ipVM) === undefined) {
            throw new Condicion('No hay conexión con el servidor de la asignación');
          }
          const socketVM = this.vms.getSocketFromIP(ipVM);
          await conexion.query(`INSERT INTO Pendientes
            (ip_vm, motivo, usuario, tipo) VALUES
            ('${ipVM}', '${motivo}','${usuario}', 'down')`);
          const json = { user: usuario, motivo, puerto: results[0].puerto };
          socketVM.emit('stop', json);

          logger.info(`enviado stop a ${ipVM} para ${usuario}-${motivo}`);
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.mapUserSocket.get(usuario) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.info(err.msg);
          } else {
            logger.warn(`Error en 'stopenlace' '${usuario}'-'${motivo}': ${err}`);
          }
        }
        await conexion.query('UNLOCK TABLES');
        await conexion.release();
      });

      socket.on('obtenerenlace', async (motivo) => {
        if (!usuario) {
          logger.warn('En obtenerenlace pero no hay usuario definido');
          if (this.mapUserSocket.get(usuario) !== undefined) {
            socket.emit('data-error', { msg: 'Accesso sin iniciar sesión' });
          }
          return;
        }
        logger.info(`obtenerenlace '${usuario}'- '${motivo}'`);
        // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
        if (functions.cleanAddress(socket.handshake.address) !== socket.session.ip_origen) {
          const msg = 'Está accediendo desde una ip diferente a la inicial';
          if (this.mapUserSocket.get(usuario) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.warn(msg);
          return;
        }

        let conexion;
        try {
          const pool = await db.pool;
          conexion = await pool.getConnection();
          await conexion.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          if (this.mapUserSocket.get(usuario) !== undefined) {
            socket.emit('data-error', { msg });
          }
          logger.error(msg);
          return;
        }
        try {
          const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Matriculados AS m1
            WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
          if (existeMatriculados <= 0) {
            throw new Condicion('No está matriculado de este servidor');
          }

          const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
            FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
            WHERE usuario='${usuario}' AND motivo='${motivo}'
            UNION SELECT motivo FROM Eliminar_servicio as es
            WHERE motivo='${motivo}') AS alias`))[0].total;
          if (eliminando > 0) {
            throw new Condicion('No se puede parar, se está eliminando servicio (individual o global)');
          }

          const motivototal = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
          if (motivototal > 0) {
            throw new Condicion('Servicio ya asignado');
          }
          const pendientes1 = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
          if (pendientes1 > 0) {
            throw new Condicion('Servicio ya pendiente');
          }
          logger.info('no esta en pendientes ni en asignaciones');
          const userEnCola = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Cola AS c1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
          if (userEnCola > 0) {
            throw new Condicion('El servicio ya está en cola');
          }
          const asignasUser = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${usuario}'`))[0].total;
          const colasUser = (await conexion.query(`SELECT COUNT(*) AS total
              FROM Cola AS c1 WHERE usuario='${usuario}'`))[0].total;
          const pendientesUserUp = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${usuario}' AND tipo='up'`))[0].total;

          if ((asignasUser + colasUser + pendientesUserUp) >= config.numero_max_serverxuser) {
            throw new Condicion('Supera el número máximo de servidores');
          }
          logger.info(`se inserta en la cola ${usuario}-${motivo}`);
          await conexion.query(`INSERT INTO Cola (motivo, usuario)
            VALUES ('${motivo}','${usuario}')`);

          const pendientesUser = (await conexion.query(`SELECT COUNT(*) AS total
            FROM Pendientes AS p1 WHERE usuario='${usuario}'`))[0].total;
          if ((asignasUser + pendientesUser) > 0) {
            const pip = (await conexion.query(`SELECT ip_vm FROM Pendientes AS p1
                WHERE usuario='${usuario}'`));
            let ip = 0;
            if (pip.length > 0) ip = pip[0].ip_vm;
            else {
              ip = (await conexion.query(`SELECT ip_vm FROM Asignaciones AS a1
                WHERE usuario='${usuario}'`))[0].ip_vm;
            }

            if (this.vms.mapIpVMS.get(ip) === undefined) { // si la vm no esta disponible
              await conexion.query(`DELETE FROM Cola WHERE usuario='${usuario}'`);
              throw new Condicion('No se puede obtener el servidor');
            } else {
              await this.vms.mandaUsuarioVM(conexion, usuario, ip);
            }
          } else {
            logger.info(`todavia ${usuario} no tiene nada asignado`);
            this.vms.miraCola(conexion);
          }
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.mapUserSocket.get(usuario) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.info(err.msg);
          } else {
            logger.warn(`Error en 'stopenlace' '${usuario}'- '${motivo}': ${err}`);
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
      socks.forEach((value) => {
        value.emit(evento, data);
      });
    }
  }
}

module.exports = Clientes;
