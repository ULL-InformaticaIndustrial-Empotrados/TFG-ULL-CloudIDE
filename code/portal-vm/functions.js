
const moment = require('moment');
const { exec } = require('child-process-promise');

const logger = require('./logger.js').child({ label: 'functions' });

const CREDS = require('./creds');

const config = require('./config.json');

module.exports = {

  cleanAddress(ip) {
    let aux = ip;
    if (aux.substr(0, 7) === '::ffff:') {
      aux = aux.substr(7);
    }
    return aux;
  },


  async eliminardirectoriosolo(usuario, motivo, callback) {
    try {
      const result = await exec(`./sh/eliminardirectorio.sh \
        ${CREDS.password_root} ${1} ${config.path_almacenamiento} \
        ${usuario} ${motivo}`);
      // controlamos el error
      logger.debug(`eliminardirectoriosolo salida estandar: "${result.stdout}"`);
      logger.info(`eliminardirectoriosolo se ha eleminado "${usuario}"`);
      callback();
    } catch (error) {
      logger.warn(`Error eliminardirectoriosolo: "${error}"`);
    }
  },

  async eliminardirectoriotodo(motivo, callback) {
    try {
      const result = await exec(`./sh/eliminardirectorio.sh \
        ${CREDS.password_root} ${2} ${config.path_almacenamiento} ${motivo}`);
      logger.debug(`eliminardirectoriotodo salida estandar: "${result.stdout}"`);
      logger.info('eliminardirectoriotodo se ha eleminado');
      callback();
    } catch (error) {
      logger.warn(`Error eliminardirectoriotodo: "${error}"`);
    }
  },

  dateFormat() {
    return moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  },

  getCleanedString(cadenaPar) {
    // Definimos los caracteres que queremos eliminar
    const specialChars = ' !@#$^&%*()+=-[]/{}|:<>?,.';

    let cadena = cadenaPar;
    // Los eliminamos todos
    for (let i = 0; i < specialChars.length; i += 1) {
      cadena = cadena.replace(new RegExp(`\\${specialChars[i]}`, 'gi'), '');
    }

    // Lo queremos devolver limpio en minusculas
    cadena = cadena.toLowerCase();

    // Quitamos espacios y los sustituimos por _ porque nos gusta mas asi
    cadena = cadena.replace(/ /g, '_');

    // Quitamos acentos y "ñ". Fijate en que va sin comillas el primer parametro
    cadena = cadena.replace(/á/gi, 'a');
    cadena = cadena.replace(/é/gi, 'e');
    cadena = cadena.replace(/í/gi, 'i');
    cadena = cadena.replace(/ó/gi, 'o');
    cadena = cadena.replace(/ú/gi, 'u');
    cadena = cadena.replace(/ñ/gi, 'n');
    return cadena;
  },

};
