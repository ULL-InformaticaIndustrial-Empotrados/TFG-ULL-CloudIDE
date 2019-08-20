
/* eslint no-await-in-loop: "off" */

const PythonShell = require('python-shell');


const logger = require('./logger.js').child({ label: 'ovirt' });
const db = require('./database.js');
const config = require('./config.json');

function pythonShellPromise(command, options) {
  return new Promise((resolve, reject) => {
    PythonShell.run(command, options, (err, results) => {
      if (err) reject(err);
      resolve(results);
    });
  });
}

class Ovirt {
  constructor() {
    this.pool = undefined;
    this.dbConn = undefined;
    this.bloqueadas = false;
  }

  static async addAndStartVm(name, ipAddress) {
    logger.debug(`Se pide arrancar '${name}' con ip '${ipAddress}'`);
    const options = {
      mode: 'text',
      scriptPath: './ovirtpython',
      args: [name, ipAddress],
    };

    const results = await pythonShellPromise('add_and_start_vm.py', options);
    // results is an array consisting of messages collected during execution
    logger.debug(`add_and_start_vm.py results: "${results}"`);
    logger.debug(`Arrancada '${name}' con ip '${ipAddress}'`);
  }

  static async stopAndRemoveVm(name) {
    logger.debug(`Se pide parar '${name}'`);
    const options = {
      mode: 'text',
      scriptPath: './ovirtpython',
      args: [name],
    };

    const results = await pythonShellPromise('stop_and_remove_vm.py', options);
    // results is an array consisting of messages collected during execution
    logger.debug(`stop_and_remove_vm.py results: "${results}"`);
    logger.debug(`Se ha parado '${name}'`);
  }

  async obtieneConn() {
    if (this.pool === undefined) this.pool = await db.pool;
    if (this.dbConn === undefined) {
      this.dbConn = await this.pool.getConnection();
      logger.debug('Obtenemos nueva conexión a DB');
    } else {
      logger.warn('Se pidió obtener conexión a DB cuando ya teníamos');
    }
  }

  async liberaConn() {
    if (this.dbConn === undefined) {
      logger.warn('Se pidió liberar conexión a DB cuando NO teníamos');
    } else {
      await this.dbConn.release();
      logger.debug('Liberada conexión a DB');
    }
  }

  async realizaQuery(consulta) {
    try {
      logger.debug(`Realizamos consulta: "${consulta}"`);
      const resultado = await this.dbConn.query(consulta);
      return resultado;
    } catch (error) {
      logger.warn(`Error al realiza consulta "${consulta}": ${error}`);
      throw error;
    }
  }

  async bloqueaTablas() {
    if (this.bloqueadas) return;
    await this.realizaQuery(db.bloqueoTablas);
    this.bloqueadas = true;
  }

  async desbloqueaTablas() {
    if (!this.bloqueadas) return;
    await this.realizaQuery(db.desbloqueoTablas);
    this.bloqueadas = false;
  }

  async levantaMaquinas(cuantas) {
    logger.info(`Tenemos que levantar ${cuantas} maquinas`);
    let quedan = cuantas;
    while (quedan > 0) {
      const ipEscogida = (await this.realizaQuery(`SELECT * FROM Banco_ip as ip
        WHERE ip NOT IN ( SELECT ip_vm FROM Ovirt as ov) LIMIT 1`))[0].ip;
      logger.debug(`Elegida ip ${ipEscogida} para levantar`);
      await this.realizaQuery(`INSERT INTO Ovirt (Name, ip_vm)
        VALUES ('ULL-CloudIDE-backend-${ipEscogida}', '${ipEscogida}')`);
      await this.realizaQuery(`INSERT INTO Ovirt_Pendientes (Name, ip_vm, tipo)
        VALUES ('ULL-CloudIDE-backend-${ipEscogida}', '${ipEscogida}', 'up')`);
      await this.realizaQuery(`INSERT INTO Ovirt_Pendientes_Up_AddStart (Name, ip_vm)
        VALUES ('ULL-CloudIDE-backend-${ipEscogida}', '${ipEscogida}')`);

      await this.addAndStartVm(`ULL-CloudIDE-backend-${ipEscogida}`, ipEscogida);
      await this.realizaQuery(`DELETE FROM Ovirt_Pendientes_Up_AddStart
          WHERE ip_vm='${ipEscogida}'`);
      logger.info(`VM added and started "ULL-CloudIDE-backend-${ipEscogida}"`);

      quedan -= 1;
    }
  }

  async bajarMaquinas(cuantas) {
    logger.info(`Tenemos que bajar ${cuantas} maquinas`);
    let quedan = cuantas;
    while (quedan > 0) {
      const ipBajar = (await this.realizaQuery(`SELECT ip_vm FROM VMS as v1
        WHERE prioridad=1 LIMIT 1`))[0].ip_vm;
      await this.realizaQuery(`DELETE FROM VMS WHERE ip_vm='${ipBajar}`);
      await this.realizaQuery(`INSERT INTO Ovirt_Pendientes (Name, ip_vm, tipo)
        VALUES ('ULL-CloudIDE-backend-${ipBajar}', '${ipBajar}', 'down')`);

      // const contar_ovp_down = (await this.realizaQuery(`SELECT count(*) as total
      //   FROM Ovirt_Pendientes as ovp WHERE tipo='down'`))[0].total;

      await this.stopAndRemoveVm(`ULL-CloudIDE-backend-${ipBajar}`);
      await this.realizaQuery(`DELETE FROM Ovirt_Pendientes WHERE ip_vm='${ipBajar}'`);
      await this.realizaQuery(`DELETE FROM Ovirt WHERE ip_vm='${ipBajar}'`);
      logger.info(`VM stopped and removed "ULL-CloudIDE-backend-${ipBajar}"`);

      quedan -= 1;
    }
  }


  async ajustaVMArrancadas() {
    logger.debug('Entramos ajustaVMArrancadas');
    await this.obtieneConn();
    await this.bloqueaTablas();
    try {
      const maqActivas = (await this.realizaQuery(`SELECT COUNT(*) AS total FROM
        ( SELECT ip_vm FROM VMS as v1 WHERE prioridad=1 UNION
          SELECT ip_vm FROM Ovirt_Pendientes as ovp WHERE tipo='up') as t1`))[0].total;
      const usuariosEnCola = (await this.realizaQuery(`SELECT
        COUNT(DISTINCT usuario) AS total FROM Cola as c1`))[0].total;

      const maqNecesarias = (usuariosEnCola / config.numero_max_users)
        + config.numero_vm_reserva;
      if (maqActivas < maqNecesarias) {
        logger.info(`Hay menos máquinas de las necesarias: ${maqActivas} < ${maqNecesarias}`);
        await this.levantaMaquinas(maqNecesarias - maqActivas);
      } else { // Hay mas en cola
        const maqPrioridad = (await this.realizaQuery(`SELECT COUNT(*) AS total
          FROM VMS as v1 WHERE prioridad=1`))[0].total;
        if (maqPrioridad > config.numero_vm_reserva) {
          logger.info(`Hay más máquinas de las necesarias: ${maqPrioridad} > ${config.numero_vm_reserva}`);
          await this.bajarMaquinas(maqPrioridad - config.numero_vm_reserva);
        } else {
          logger.info(`Hay número adecuado de máquinas: ${maqActivas}`);
        }
      }
    } catch (error) {
      logger.warn(`Error al tratar de ajustar número de máquinas: ${error}`);
    }
    await this.desbloqueaTablas();
    await this.liberaConn();
  }
}

module.exports = {
  Ovirt,
};
