
const os = require('os');
const { exec } = require('child-process-promise');

const logger = require('./logger.js').child({ label: 'functions' });

function getiplocal() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
        logger.info(`IP local encontrada: "${address.address}"`);
      }
    }
  }

  return addresses;
}

async function cleandockerimages() {
  logger.info('cleandockerimages NO borramos nada');
  return;
  const comando = `/usr/bin/docker images --format "{{.ID}}:{{.Repository}}" \
      | grep -v -f imagenesConservar.lst \
      | cut -d: -f1 \
      | uniq \
      | tr '\n' ' ' \
  `;
  logger.debug(`cleandockerimages comando: "${comando}"`);
  try {
    const result = await exec(comando);
    if (result.stdout.length <= 0) {
      logger.debug('No hay imagenes que borrar');
      return;
    }
    logger.debug(`Borrando imagenes docker "${result.stdout}"`);
    const resultRmi = await exec(`/usr/bin/docker rmi ${result.stdout}`);
    logger.debug(`Borrando imagenes salida : "${resultRmi.stdout}"`);
  } catch (error) {
    logger.warn(`Error borrando images: "${error}"`);
  }
}

module.exports.cleandockerimages = cleandockerimages;
module.exports.getiplocal = getiplocal;
