const logger = require(`winston`);
const { exec } = require(`child-process`);


const config = require(`./config.json`);

module.exports = {

  dnatae(modo, ipSource, ipDest, port, callback) {
    let modoI;
    if (modo === `añadirtodo`) { // añadirtodo -> 1, eliminar -> 4, añadirsolo -> 3
      logger.debug(`Añadir todo de la ip de origen "${ipSource}"`);
      modoI = 1;
    }
    if (modo === `añadircomienzo`) {
      logger.debug(`Añadir comienzo de la ip de origen "${ipSource}"`);
      modoI = 2;
    }
    if (modo === `eliminarsolo`) {
      logger.debug(`Eliminar solo de la ip de origen "${ipSource}"`);
      modoI = 4;
    }
    if (modo === `añadirsolo`) {
      logger.debug(`Añadir solo de la ip de origen "${ipSource}"`);
      modoI = 3;
    }

    exec(`./sh/dnat.sh ` + modoI + ` ` + ipSource +` `+ ipDest +` `+ port+` `+config.password_root,
      (error, stdout, stderr) => {
        // controlamos el error
        if (error !== null) {
          logger.error(`dnat.sh exec error: "${error}"`);
        }
        logger.debug(`dnat.sh exec salida: "${stdout}"`);

        if (callback != null) {
          callback();
        }
      });
  },

  deletednat(ipSource, callback) {
    logger.debug(`Eliminar todo de la ip de origen "${ipSource}"`);

    exec(`./sh/deletednat0.sh `+ ipSource +` `+config.password_root,
      (error, stdout, stderr) => {
        // controlamos el error
        if (error !== null) {
          logger.error(`deletednat0.sh exec error: "${error}"`);
        }
        logger.debug(`deletednat0.sh exec salida: "${stdout}"`);

        if (callback != null) {
          callback();
        }
      });
  },

  inicializar() {
    exec(`./sh/inicializar.sh `+config.password_root +` `+ config.interfaz_exterior +` `+ config.interfaz_interior +` `+ config.ip_server_interior,
      (error, stdout, stderr) => {
        // controlamos el error
        if (error !== null) {
          logger.error(`inicializar.sh exec error: "${error}"`);
        }
        logger.debug(`inicializar.sh exec salida: "${stdout}"`);
      });
  },

  tcpkillestablished(ipSource) {
    exec(`./sh/tcpkillestablished.sh `+config.password_root +` `+ ipSource,
      (error, stdout, stderr) => {
        // controlamos el error
        if (error !== null) {
          logger.error(`tcpkillestablished.sh exec error: "${error}"`);
        }
        logger.debug(`tcpkillestablished.sh exec salida: "${stdout}"`);
      });
  },

};
