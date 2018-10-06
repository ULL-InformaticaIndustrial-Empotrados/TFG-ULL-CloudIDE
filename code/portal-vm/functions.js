const logger = require(`winston`);

const os = require(`os`);
const mysql = require(`promise-mysql`);
const moment = require(`moment`);
const { exec } = require(`child_process`);

const config = require(`./config.json`);

module.exports = {

  cleanaddress(ip) {
    let aux = ip;
    if (aux.substr(0, 7) === `::ffff:`) {
      aux = aux.substr(7);
    }
    return aux;
  },

  getiplocal() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
      for (const k2 in interfaces[k]) {
        const address = interfaces[k][k2];
        if (address.family === `IPv4` && !address.internal) {
          addresses.push(address.address);
          logger.info(`IP local encontrada: "${address.address}"`);
        }
      }
    }
    return addresses;
  },

  createnewconnection() {
    const pool = mysql.createPool({
      host: config.host_bbdd_mysql,
      user: config.user_bbdd_mysql,
      password: config.password_bbdd_mysql,
      database: config.database_bbdd_mysql,
      // debug : true,
      acquireTimeout: 60 * 60 * 1000,
      connectTimeout: 60 * 60 * 1000,
      timeout: 60 * 60 * 1000,
      connectionLimit: 5,
      queueLimit: 0,
    });
    logger.debug(`creado poll conexiones MySQL`);

    pool.on(`release`, (connection) => {
      logger.debug(`Connection MySQL "${connection.threadId}" released`);
    });

    return pool;
  },

  eliminardirectoriosolo(usuario, motivo, callback) {
    const comando = `rm -Rf ${config.path_almacenamiento}/${usuario}-${motivo}`;
    logger.debug(`eliminardirectoriosolo ejecutamos comando "${comando}"`);
    exec(comando, (error, stdout, stderr) => {
      // controlamos el error
      if (error !== null) {
        logger.warn(`Error eliminardirectoriosolo: "${error}"`);
      }
      logger.debug(`eliminardirectoriosolo salida estandar: "${stdout}"`);
      logger.info(`eliminardirectoriosolo se ha eleminado "${usuario}"`);
      callback();
    });
  },

  eliminardirectoriotodo(motivo, callback) {
    const comando = `rm -Rf ${config.path_almacenamiento}/*-${motivo}`;
    logger.debug(`eliminardirectoriotodo ejecutamos comando "${comando}"`);
    exec(comando, (error, stdout, stderr) => {
      // controlamos el error
      if (error !== null) {
        logger.warn(`Error eliminardirectoriotodo: "${error}"`);
      }
      logger.debug(`eliminardirectoriotodo salida estandar: "${stdout}"`);
      logger.info(`eliminardirectoriotodo se ha eleminado`);
      callback();
    });
  },

  dateFormat() {
    return moment(Date.now()).format(`YYYY-MM-DD HH:mm:ss`);
  },

  getCleanedString(cadenaInicial) {
    // Definimos los caracteres que queremos eliminar
    const specialChars = ` !@#$^&%*()+=-[]/{}|:<>?,.`;

    let cadena = cadenaInicial;
    // Los eliminamos todos
    for (let i = 0; i < specialChars.length; i += 1) {
      cadena = cadena.replace(new RegExp(`\\${specialChars[i]}`, `gi`), ``);
    }

    // Lo queremos devolver limpio en minusculas
    cadena = cadena.toLowerCase();

    // Quitamos espacios y los sustituimos por _ porque nos gusta mas asi
    cadena = cadena.replace(/ /g, `_`);

    // Quitamos acentos y `ñ`. Fijate en que va sin comillas el primer parametro
    cadena = cadena.replace(/á/gi, `a`);
    cadena = cadena.replace(/é/gi, `e`);
    cadena = cadena.replace(/í/gi, `i`);
    cadena = cadena.replace(/ó/gi, `o`);
    cadena = cadena.replace(/ú/gi, `u`);
    cadena = cadena.replace(/ñ/gi, `n`);
    return cadena;
  },

};
