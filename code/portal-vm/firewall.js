const logger = require('winston');
var config = require('./config.json');
module.exports = {

  dnatae : function(modo, ip_source, ip_dest, port, callback){
    var exec = require('child_process').exec, child;

     if(modo == "añadirtodo"){ //añadirtodo -> 1, eliminar -> 4, añadirsolo -> 3
       logger.debug(`Añadir todo de la ip de origen "${ip_source}"`);
       modo = 1;
     }
      if(modo == "añadircomienzo"){
       logger.debug(`Añadir comienzo de la ip de origen "${ip_source}"`);
       modo = 2;
     }
     if(modo == "eliminarsolo"){
       logger.debug(`Eliminar solo de la ip de origen "${ip_source}"`);
       modo = 4;
     }
      if(modo == "añadirsolo"){
       logger.debug(`Añadir solo de la ip de origen "${ip_source}"`);
       modo = 3;
     }

    child = exec('./sh/dnat.sh ' + modo + " " + ip_source +" "+ ip_dest +" "+ port+" "+config.password_root,
      function (error, stdout, stderr) {
        // controlamos el error
        if (error !== null) {
          logger.error(`dnat.sh exec error: "${error}"`);
        }
        logger.debug(`dnat.sh exec salida: "${stdout}"`);

        if(callback != null){
          callback();
        }
      });

  },


  deletednat : function(ip_source, callback){
    logger.debug(`Eliminar todo de la ip de origen "${ip_source}"`);
    var exec = require('child_process').exec, child;

    child = exec('./sh/deletednat0.sh '+ ip_source +" "+config.password_root,
      function (error, stdout, stderr) {
        // controlamos el error
        if (error !== null) {
          logger.error(`deletednat0.sh exec error: "${error}"`);
        }
        logger.debug(`deletednat0.sh exec salida: "${stdout}"`);

        if(callback != null){
          callback();
        }
    });

  },


  inicializar : function(){
    var exec = require('child_process').exec, child;

    child = exec('./sh/inicializar.sh '+config.password_root +" "+ config.interfaz_exterior +" "+ config.interfaz_interior +" "+ config.ip_server_interior,
      function (error, stdout, stderr) {
        // controlamos el error
        if (error !== null) {
          logger.error(`inicializar.sh exec error: "${error}"`);
        }
        logger.debug(`inicializar.sh exec salida: "${stdout}"`);
    });
  },


  tcpkillestablished : function(ip_source){
    var exec = require('child_process').exec, child;

    child = exec('./sh/tcpkillestablished.sh '+config.password_root +" "+ ip_source,
      function (error, stdout, stderr) {
        // controlamos el error
        if (error !== null) {
          logger.error(`tcpkillestablished.sh exec error: "${error}"`);
        }
        logger.debug(`tcpkillestablished.sh exec salida: "${stdout}"`);
    });
  }

}
