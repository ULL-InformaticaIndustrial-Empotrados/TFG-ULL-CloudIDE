const SIO = require('socket.io');

const logger = require('./logger.js').child({ module: 'vms' });

logger.info('Comienza modulo vms');

const config = require('./config.json');
const functions = require('./functions.js');
const db = require('./database.js');
const ovirt = require('./ovirt.js');
const firewall = require('./firewall.js');

// Clase para las excepciones propias
class Condicion {
  constructor(msg) {
    this.msg = msg;
  }
}


class VMs {
  setServidores(serv) {
    this.serv = serv;
  }

  setClientes(cli) {
    this.cli = cli;
  }

  constructor() {
    this.cli = undefined;
    this.serv = undefined;

    this.wsVMs = new SIO(config.puerto_websocket_vms, {
      pingTimeout: 3000,
      pingInterval: 3000,
    });

    this.mapIpVMS = new Map();

    this.wsVMs.on('connection', async (socket) => {
      const ipVM = functions.cleanAddress(socket.handshake.address);
      logger.info(`Conexión de "${socket.id}" Con ip "${ipVM}"`);

      if (this.mapIpVMS.get(ipVM) === undefined) {
        this.mapIpVMS.set(ipVM, []);
      }

      this.mapIpVMS.get(ipVM).push(socket);

      logger.info(`mapIpVMS tiene longitud  ${this.mapIpVMS.size}`);

      let conexion;
      try {
        const pool = await db.pool;
        conexion = await pool.getConnection();
        await conexion.query(db.bloqueoTablas);
      } catch (err) {
        const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
        logger.error(msg);
        return;
      }
      try {
        const existePendientesOvirt = (await conexion.query(`SELECT *
          FROM Ovirt_Pendientes as ovp WHERE ip_vm='${ipVM}'`));
        if (existePendientesOvirt.length > 0) {
          if (existePendientesOvirt[0].tipo === 'down') {
            throw new Condicion(`La VM ${ipVM} está en estado 'down'`);
          }
          await conexion.query(`DELETE FROM Ovirt_Pendientes WHERE ip_vm='${ipVM}'`);
        }
        await VMs.actualizaVM(conexion, ipVM);
        logger.info(`La VM ${ipVM} ha arrancado`);
        await this.miraCola(conexion);
      } catch (err) {
        if (err instanceof Condicion) {
          logger.info(err.msg);
        } else {
          logger.warn(`Error en 'connection' de ${ipVM}: ${err}`);
        }
      }
      await conexion.query('UNLOCK TABLES');
      await conexion.release();
      ovirt.ajustaVMArrancadas();

      socket.on('disconnect', async () => {
        logger.info(`VM disconnected "${ipVM}"`);

        if (this.mapIpVMS.get(ipVM) === undefined) {
          logger.warn(`La VM ${ipVM} se está desconectando pero no estaba registrada`);
          return;
        }
        if (this.mapIpVMS.get(ipVM).length <= 0) {
          logger.warn(`La VM ${ipVM} se está desconectando pero no tiene sockests`);
          return;
        }
        this.mapIpVMS.get(ipVM).shift().disconnect();
        if (this.mapIpVMS.get(ipVM).length > 0) {
          logger.error(`La VM ${ipVM} se está desconectando y tiene + de 1 socket`);
          return;
        }
        this.mapIpVMS.delete(ipVM);
        let conex;
        try {
          const pool = await db.pool;
          conex = await pool.getConnection();
          await conex.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          logger.error(msg);
          return;
        }
        await conex.query(`DELETE FROM VMS WHERE ip_vm='${ipVM}'`);
        await conex.query('UNLOCK TABLES');
        await conex.release();
      });


      socket.on('loaded', async (data) => {
        const json = data;
        json.accion = 'loaded';
        json.ipVM = ipVM;
        logger.info(`Recibido loaded "${JSON.stringify(json)}"`, json);
        let conex;
        try {
          const pool = await db.pool;
          conex = await pool.getConnection();
          await conex.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          logger.error(msg);
          return;
        }
        const { user, motivo, puerto } = data;
        try {
          const pend = (await conex.query(`SELECT * FROM Pendientes AS p1
            WHERE ip_vm='${ipVM}' AND motivo='${motivo}' AND usuario='${user}'
              AND tipo='up'`));

          if (pend.length > 0) {
            await conex.query(`DELETE FROM Pendientes
              WHERE usuario='${user}' AND motivo='${motivo}' AND tipo='up'`);
            logger.debug(`Ya no pendiente ${user}-${motivo}`);
          } else {
            logger.warn(`No estaba en pendientes ${JSON.stringify(json)}`);
          }

          // Estubiera o no pendiente lo asignamos
          await conex.query(`INSERT INTO Asignaciones (ip_vm, usuario, motivo, puerto)
            VALUES ('${ipVM}','${user}','${motivo}', ${puerto})`);

          const row = (await conex.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${user}'`))[0].total;
          const fireUser = await conex.query(`SELECT ip_origen FROM Firewall AS f1
            WHERE usuario='${user}'`);
          if ((fireUser.length > 0)) {
            logger.debug(`El usuario ${user} tiene IP en Firewall ${fireUser.length}`);
            for (const item of fireUser) {
              if (row <= 1) { // es la primera asignación
                this.serv.broadcastServers('añadircomienzo', { ip_origen: item.ip_origen, ipVM, puerto });
                await firewall.dnatae('añadircomienzo', item.ip_origen, ipVM, 0);
              }
              this.serv.broadcastServers('añadirsolo', { ip_origen: item.ip_origen, ipVM, puerto });
              await firewall.dnatae('añadirsolo', item.ip_origen, ipVM, puerto);
            }
            if (this.cli.mapUserSocket.get(user) !== undefined) {
              this.cli.broadcastClient(user, 'resultado', { motivo });
            } else {
              this.serv.broadcastServers('enviar-resultado', { motivo, user });
            }
          }


          // comprobamos si el servicio se está eliminando
          const elimServ = (await conex.query(`SELECT count(*) AS total
            FROM Eliminar_servicio as es WHERE motivo='${motivo}'`))[0].total;
          const elimServUser = (await conex.query(`SELECT COUNT(*) AS total FROM Eliminar_servicio_usuario
            WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
          if ((elimServ + elimServUser) > 0) {
            logger.info(`El servicio ${user}-${motivo} se está eliminando`);
            this.mandaParar(conex, {
              user, motivo, puerto, ip_vm: ipVM,
            });
          }
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.cli.mapUserSocket.get(user) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.warn(err.msg);
          } else {
            logger.error(`Error en 'loaded' '${user}'-'${motivo}': ${err}`);
          }
        }
        await conex.query('UNLOCK TABLES');
        await conex.release();
      });

      socket.on('stopped', async (data) => {
        const json = data;
        json.accion = 'stopped';
        json.ipVM = ipVM;
        logger.info(`Recibido stopped "${JSON.stringify(json)}"`, json);
        let conex;
        try {
          const pool = await db.pool;
          conex = await pool.getConnection();
          await conex.query(db.bloqueoTablas);
        } catch (err) {
          const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
          logger.error(msg);
          return;
        }
        const { user, motivo, puerto } = data;
        try {
          const asignas = (await conex.query(`SELECT * FROM Asignaciones AS a1
            WHERE ip_vm='${ipVM}' AND motivo='${motivo}' AND usuario='${user}'`));
          logger.debug(`Número asignas para ${user}-${motivo}-${ipVM} = ${asignas.length}`);

          if (asignas.lenght <= 0) {
            throw Condicion(`No hay asignación para ${user}-${motivo}-${ipVM}`);
          }

          if (asignas.length > 1) {
            logger.warn(`Hay más de una asignación para ${user}-${motivo}-${ipVM}`);
          }

          await conex.query(`DELETE FROM Asignaciones
            WHERE motivo='${motivo}' AND usuario='${user}'`);
          await conex.query(`DELETE FROM Pendientes
            WHERE usuario='${user}' AND motivo='${motivo}' AND tipo='down'`);
          logger.debug(`stopping ${user}-${motivo}: borrado de asignaciones y pendientes`);

          await VMs.actualizaVM(conex, ipVM);

          const totalAsigUser = (await conex.query(`SELECT COUNT(*) AS total
            FROM Asignaciones AS a1 WHERE usuario='${user}'`))[0].total;
          const fireUser = (await conex.query(`SELECT ip_origen FROM Firewall AS f1
            WHERE usuario='${user}'`));
          if (fireUser.length > 0) {
            logger.warn(`El usuario ${user} tiene 1 firewall o más (${fireUser.length})`);
            for (const item of fireUser) {
              if (totalAsigUser > 0) {
                this.serv.broadcastServers('dnatae-eliminarsolo',
                  { ip_origen: item.ip_origen, ipVM, puerto });
                firewall.dnatae('eliminarsolo', item.ip_origen, ipVM, puerto);
              } else {
                this.serv.broadcastServers('deletednat', item.ip_origen);
                firewall.deletednat(item.ip_origen);
              }
            }
          }

          if (this.cli.mapUserSocket.get(user) !== undefined) {
            logger.debug(`Avisamos cliente ${user}-${motivo} STOP`);
            this.cli.broadcastClient(user, 'stop', { motivo });
          } else {
            logger.debug(`Avisamos a OTRO servidor cliente ${user}-${motivo} STOP`);
            this.serv.broadcastServers('enviar-stop', { user, motivo });
          }

          await VMs.compruebaEliminarServicioUsuario(conex, motivo, user);
          await this.miraCola(conex);
        } catch (err) {
          if (err instanceof Condicion) {
            if (this.cli.mapUserSocket.get(user) !== undefined) {
              socket.emit('data-error', { msg: err.msg });
            }
            logger.info(err.msg);
          } else {
            logger.warn(`Error en 'stopenlace' '${user}'- '${motivo}': ${err}`);
          }
        }
        await conex.query('UNLOCK TABLES');
        await conex.release();
        ovirt.ajustaVMArrancadas();
      });
    });
    ovirt.ajustaVMArrancadas();
  }

  getSocketFromIP(ip) {
    return this.mapIpVMS.get(ip)[this.mapIpVMS.get(ip).length - 1];
  }

  // Devuelve si hay información sobre máquina con esta ip
  // es decir, si tiene un socket registrado
  isVMConectedIP(ip) {
    return this.mapIpVMS.get(ip) !== undefined;
  }

  // Actuliza estado de la VM según el número de usuarios asignados
  // Se le pasa conexion suponiendo tablas bloqueadas
  static async actualizaVM(conexion, ipVM) {
    // TODO borrar entrada para no tener que distinguir si existe
    const existe = (await conexion.query(`SELECT COUNT(*) AS total
      FROM VMS as v1 WHERE ip_vm='${ipVM}'`))[0].total > 0;

    const numeroUsersVM = (await conexion.query(`SELECT
      count(DISTINCT usuario) AS total FROM
      (SELECT DISTINCT usuario from Asignaciones as a1
        WHERE ip_vm='${ipVM}' UNION
        SELECT DISTINCT usuario FROM Pendientes as p1
        WHERE ip_vm='${ipVM}')
      AS tmp`))[0].total;
    logger.info(`La VM ${ipVM} tiene ${numeroUsersVM}" usuarios`);
    if (numeroUsersVM >= config.numero_max_users) {
      if (existe) {
        await conexion.query(`DELETE FROM VMS WHERE ip_vm='${ipVM}'`);
        logger.info(`VM ${ipVM} con máximo de usuaros → eliminamos de disponibles`);
      }
    } else if (numeroUsersVM > 0) {
      if (existe) {
        await conexion.query(`UPDATE VMS SET prioridad=0 WHERE ip_vm='${ipVM}'`);
        logger.info(`VM ${ipVM} tiene pocos usuarios → a prioridad 0`);
      } else {
        await conexion.query(`INSERT INTO VMS (prioridad, ip_vm) VALUES (0,'${ipVM}')`);
        logger.info(`VM ${ipVM} tiene pocos usuarios → añadimos con prioridad 0`);
      }
    } else if (existe) {
      await conexion.query(`UPDATE VMS SET prioridad=1 WHERE ip_vm='${ipVM}'`);
      logger.info(`VM ${ipVM} sin usuarios → a prioridad 1`);
    } else {
      await conexion.query(`INSERT INTO VMS (prioridad, ip_vm) VALUES (1,'${ipVM}')`);
      logger.info(`VM ${ipVM} sin usuarios → añadimos con prioridad 1`);
    }
  }

  // Manda todos los motivos pendientes del usuaraio a la VM indicada
  // Se le pasa conexion suponiendo tablas bloqueadas
  async mandaUsuarioVM(conexion, usuario, ipVM) {
    if (this.mapIpVMS.get(ipVM) === undefined) {
      throw new Condicion(`La máquina ${ipVM} en cola no tiene socket`);
    }
    const motivos = await conexion.query(`SELECT * FROM Cola AS c1
      WHERE usuario='${usuario}'`);
    logger.debug(`La máquina ${ipVM} tiene socket (está activa)`);
    for (const item of motivos) {
      await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
        VALUES ('${ipVM}', '${item.motivo}', '${usuario}', 'up')`);
      const json = { user: usuario, motivo: item.motivo };
      this.getSocketFromIP(ipVM).emit('load', json);
      json.accion = 'load';
      json.ipVM = ipVM;
      logger.info(`Enviado 'load' ${JSON.stringify(json)}`, json);
      await conexion.query(`DELETE FROM Cola
        WHERE usuario='${usuario}' AND motivo='${item.motivo}'`);
      json.accion = 'sacarcola';
      json.ipVM = 'none';
      logger.info(`Scarcola cola ${JSON.stringify(json)}`, json);
    }

    logger.debug(`Usuario ${usuario} enviado a VM ${ipVM} y borrado Cola`);
    await VMs.actualizaVM(conexion, ipVM);
  }

  // Mira si hay VMs y motivos en cola y asigna los de un usuario
  // a una máquina.
  // Cicla hasta que no pueda hacer más asignas
  // Se le pasa conexion suponiendo tablas bloqueadas
  async miraCola(conexion) {
    for (;;) {
      const nEnCola = (await conexion.query(`SELECT COUNT(*)
        AS total FROM Cola AS c1`))[0].total;
      const nVMs = (await conexion.query(`SELECT COUNT(*)
        AS total FROM VMS AS v1`))[0].total;
      logger.info(`Hay maquinas ${nVMs} libres y ${nEnCola} en la cola`);

      if ((nVMs <= 0) || (nEnCola <= 0)) break;

      const { usuario } = (await conexion.query('SELECT * FROM Cola AS c1 LIMIT 1'))[0];
      const ipVM = (await conexion.query(`SELECT * FROM VMS AS v1
        ORDER BY prioridad ASC LIMIT 1`))[0].ip_vm;

      await this.mandaUsuarioVM(conexion, usuario, ipVM);
    }
  }

  // Mira si está pendiente la eliminación de ese motivo y usuario
  // Se le pasa conexion suponiendo tablas bloqueadas
  static async compruebaEliminarServicioUsuario(conex, motivo, user) {
    logger.debug(`compruebaEliminarServicioUsuario: ${user}-${motivo}`);
    const elimServicio = (await conex.query(`SELECT count(*) AS total
      FROM Eliminar_servicio as es WHERE motivo='${motivo}'`))[0].total > 0;
    const elimServUser = (await conex.query(`SELECT COUNT(*) AS total
      FROM Eliminar_servicio_usuario as esu
        WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total > 0;
    logger.debug(`compruebaEliminarServicioUsuario: S${elimServicio} U${elimServUser}`);
    if (elimServicio || elimServUser) {
      logger.info(`Hay que elimnar servicio ${user}-${motivo}`);
      await conex.query(`DELETE FROM Matriculados
        WHERE usuario='${user}' AND motivo='${motivo}'`);
      await conex.query(`DELETE FROM Ultima_conexion
        WHERE usuario='${user}' AND motivo='${motivo}'`);
      if (elimServUser) {
        await conex.query(`DELETE FROM Eliminar_servicio_usuario
          WHERE usuario='${user}' AND motivo='${motivo}'`);
        // no hace falta que esperar por el borrado
        functions.eliminardirectoriosolo(user, motivo);
      } else {
        const totMatMotivo = (await conex.query(`SELECT count(*) AS total FROM Matriculados as m1
          WHERE motivo='${motivo}'`))[0].total;
        if (totMatMotivo <= 0) {
          logger.info(`es eliminar servicio ${motivo} y no quedan matriculados`);
          // no hace falta que esperar por el borrado
          functions.eliminardirectoriotodo(motivo);
          await conex.query(`DELETE FROM Eliminar_servicio
            WHERE motivo='${motivo}'`);
          await conex.query(`DELETE FROM Servicios
            WHERE motivo='${motivo}'`);
        }
      }
    }
  }

  // Funcion para mansar parar un usuario-servicio
  // Se pasa conexión y resultado query sobre tabla Asignaciones
  async mandaParar(conexion, asignacion) {
    const { usuario, motivo, puerto } = asignacion;
    const ipVM = asignacion.ip_vm;
    if (!this.isVMConectedIP(ipVM)) {
      throw new Condicion(`En 'mandaParar' no hay IP para '${usuario}'-'${motivo}'`);
    }
    const socketVM = this.getSocketFromIP(ipVM);
    await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
      VALUES ('${asignacion.ip_vm}', '${motivo}','${usuario}', 'down')`);
    const json = { user: usuario, motivo, puerto };
    socketVM.emit('stop', json);
    json.accion = 'stop';
    json.ipVM = ipVM;
    logger.info(`Enviado 'stop' ${JSON.stringify(json)}`, json);
  }
}

module.exports = VMs;
