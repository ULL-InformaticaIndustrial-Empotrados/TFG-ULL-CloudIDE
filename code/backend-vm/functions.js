const os = require('os');
const config = require('./config.json');

const getiplocal = function () {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (let k in interfaces) {
    for (let k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
        console.log(address.address);
      }
    }
  }

  return addresses;
};

const internet = function(modo, ip_source, ip_dest, port, callback) {
  const exec = require('child_process').exec;

  const child = exec(config.path + 'internet.sh ' + config.rootpassword + ' ' +
    config.ip_server_interior,
    function (error, stdout, stderr) {
      // Imprimimos en pantalla con console.log
      const salida = stdout;

      // controlamos el error
      if (error !== null) {
        console.log('exec error: ' + error);
      }

      console.log('Salida estándar internet: ' + salida);
    });
};

const network = function (ip) {
  const exec = require('child_process').exec;

  const child = exec(config.path + 'network.sh ' + config.rootpassword + ' ' + ip,
    function (error, stdout, stderr) {
      // Imprimimos en pantalla con console.log
      const salida = stdout;

      // controlamos el error
      if (error !== null) {
        console.log('exec error: ' + error);
      }

      console.log('Salida estándar internet: ' + salida);
    });
};

const cleandockerimages = function () {
  const exec = require('child_process').exec;

  const child = exec(config.path + 'cleandockerimages.sh ' + config.rootpassword,
    function (error, stdout, stderr) {
      // Imprimimos en pantalla con console.log
      const salida = stdout;

      // controlamos el error
      if (error !== null) {
        console.log('exec error: ' + error);
      }

      console.log('Salida estándar internet: ' + salida);
    });
};

module.exports.network = network;
module.exports.cleandockerimages = cleandockerimages;
module.exports.getiplocal = getiplocal;
module.exports.internet = internet;
