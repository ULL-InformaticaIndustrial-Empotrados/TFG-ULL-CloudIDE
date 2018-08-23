const logger = require('winston');

var config = require('./config.json');
var exec = require('child_process').exec, child;


child = exec('./comprobarche.sh ' +config.rootpassword + ' ' + 8082,
  function (error, stdout, stderr) {
        if (error !== null) {
          logger.error(`comprobarche error: "${error}"`);
        }
        logger.debug(stdout);

        if(stdout == "no existe\n"){
          logger.debug(`comprobarche: no tiene nada`);
        }
        else{
          logger.debug(`comprobarche si que existe`);
        }

});
