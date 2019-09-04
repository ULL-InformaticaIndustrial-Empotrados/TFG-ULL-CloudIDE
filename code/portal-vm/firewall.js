const { exec } = require('child-process-promise');

const logger = require('./logger.js').child({ label: 'firewall' });
const config = require('./config.json');
const db = require('./database.js');

module.exports = {

  async dnatae(modo, ipSource, ipDest, port, callback) {
    let modoNum = 0;
    // añadirtodo -> 1, eliminar -> 4, añadirsolo -> 3
    if (modo === 'añadirtodo') {
      logger.debug(`Añadir todo de la ip de origen "${ipSource}"`);
      modoNum = 1;
    }
    if (modo === 'añadircomienzo') {
      logger.debug(`Añadir comienzo de la ip de origen "${ipSource}"`);
      modoNum = 2;
    }
    if (modo === 'eliminarsolo') {
      logger.debug(`Eliminar solo de la ip de origen "${ipSource}"`);
      modoNum = 4;
    }
    if (modo === 'añadirsolo') {
      logger.debug(`Añadir solo de la ip de origen "${ipSource}"`);
      modoNum = 3;
    }

    try {
      const result = await exec(`./sh/dnat.sh ${modoNum} ${ipSource} \
        ${ipDest} ${port}`);
      logger.debug(`dnat.sh exec salida: "${result.stdout}"`);
      if (callback != null) {
        callback();
      }
    } catch (error) {
      logger.error(`dnat.sh exec error: "${error}"`);
    }
  },


  async deletednat(ipSource, callback) {
    logger.debug(`Eliminar todo de la ip de origen "${ipSource}"`);
    try {
      const result = await exec(`./sh/deletednat0.sh ${ipSource}`);
      logger.debug(`deletednat0.sh exec salida: "${result.stdout}"`);
      if (callback != null) {
        callback();
      }
    } catch (error) {
      logger.error(`deletednat0.sh exec error: "${error}"`);
    }
  },


  async inicializar() {
    try {
      const result = await exec(`./sh/inicializar.sh \
        ${config.interfaz_exterior} ${config.interfaz_interior} \
        ${config.ip_server_interior}`);
      logger.debug(`inicializar.sh exec salida: "${result.stdout}"`);
    } catch (error) {
      logger.error(`inicializar.sh exec error: "${error}"`);
    }
  },


  async tcpkillestablished(ipSource) {
    try {
      const result = await exec(`./sh/tcpkillestablished.sh ${ipSource}`);
      logger.debug(`tcpkillestablished.sh exec salida: "${result.stdout}"`);
    } catch (error) {
      logger.error(`tcpkillestablished.sh exec error: "${error}"`);
    }
  },

  async restauraFirewall() {
    logger.info('Restaurando Firewall');
    try {
      const pool = await db.pool;
      const conexion = await pool.getConnection();
      const results = await conexion.query('SELECT * FROM Firewall NATURAL JOIN Asignaciones');
      const auxiliar = new Map();
      await conexion.release();
      for (const item of results) {
        const origenUser = { ip_origen: item.ip_origen, usuario: item.usuario };
        logger.info(`Restaurando firewall "${JSON.stringify(origenUser)}"`);
        if (auxiliar.get(origenUser) === undefined) {
          await this.dnatae('añadircomienzo', item.ip_origen, item.ip_vm, 0);
          auxiliar.set(origenUser, true);
        }
        await this.dnatae('añadirsolo', item.ip_origen, item.ip_vm, item.puerto);
      }
    } catch (err) {
      logger.warn(`Error restaurando Firewall: ${err}`);
    }
  },

};
