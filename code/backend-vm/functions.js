const logger = require('winston');

var os = require('os');
var config = require('./config.json');

var getiplocal = function(){

var interfaces = os.networkInterfaces();
var addresses = [];
for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
            logger.info(`IP local encontrada: "${address.address}"`);
        }
    }
}
return addresses;
}

var cleandockerimages = function(){
  var exec = require('child_process').exec, child, salida;

  child = exec(config.path+'cleandockerimages.sh ' + config.rootpassword,
    function (error, stdout, stderr) {
      salida = stdout;
      // controlamos el error
      if (error !== null) {
        logger.warn(`Error cleandockerimages: "${error}"`);
      }
      logger.debug(`cleandockerimages salida estandar: "${salida}"`);
    });

}

module.exports.cleandockerimages = cleandockerimages;
module.exports.getiplocal = getiplocal;
