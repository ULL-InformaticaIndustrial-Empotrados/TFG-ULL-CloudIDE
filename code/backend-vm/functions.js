const logger = require('winston');

const os = require('os');

const { exec } = require('child-process-promise');

const getiplocal = function () {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (let k in interfaces) {
    for (let k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
        logger.info(`IP local encontrada: "${address.address}"`);
      }
    }
  }

  return addresses;
};

const cleandockerimages = function () {

  const comando = `/usr/bin/docker images --format "{{.ID}}:{{.Repository}}" \
      | grep -v -f imagenesConservar.lst \
      | cut -d: -f1 \
      | uniq \
      | tr '\n' ' ' \
  `;
  logger.debug(`cleandockerimages comando: "${comando}"`);
  exec(comando)
    .then((result) => {
      if (result.stdout.length > 0) {
        logger.debug(`Borrando imagenes docker "${result.stdout}"`);
        return exec(`/usr/bin/docker rmi ${result.stdout}`);
      } else
        logger.debug(`No hay imagenes que borrar`);
    })
    .then((result) => {
      if (result)  // puede no haberse ejecutado rmi
        logger.debug(`Borrando imagenes salida : "${result.stdout}"`);
    })
    .catch((error) => logger.warn(`Error borrando images: "${error}"`));

};

module.exports.cleandockerimages = cleandockerimages;
module.exports.getiplocal = getiplocal;
