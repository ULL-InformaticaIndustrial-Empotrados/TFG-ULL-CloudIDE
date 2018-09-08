const logger = require('winston');

const os = require('os');

const { exec } = require('child_process');

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

  const child = exec(__dirname + '/cleandockerimages.sh',
    function (error, stdout, stderr) {

      // controlamos el error
      if (error !== null) {
        logger.warn(`Error cleandockerimages: "${error}"`);
      }

      logger.debug(`cleandockerimages salida estandar: "${stdout}"`);
    });

};

module.exports.cleandockerimages = cleandockerimages;
module.exports.getiplocal = getiplocal;
