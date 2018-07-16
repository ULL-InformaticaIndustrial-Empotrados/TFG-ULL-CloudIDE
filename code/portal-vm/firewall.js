var config = require('./config.json');
module.exports = {

  dnatae : function(modo, ip_source, ip_dest, port, callback){
    const exec = require('child_process').exec, salida;

    //añadirtodo -> 1, eliminar -> 4, añadirsolo -> 3
    if(modo == 'añadirtodo'){
      console.log('Añadir todo de la ip de origen ' + ip_source);
      modo = 1;
    }
    if(modo == 'añadircomienzo'){
      console.log('Añadir comienzo de la ip de origen ' + ip_source);
      modo = 2;
    }
    if(modo == 'eliminarsolo'){
      console.log('Eliminar solo de la ip de origen ' + ip_source);
      modo = 4;
    }
    if(modo == 'añadirsolo'){
      console.log('Añadir solo de la ip de origen ' + ip_source);
      modo = 3;
    }

    const child = exec('./sh/dnat.sh ' + modo + ' ' + ip_source + ' '
        + ip_dest + ' ' + port + ' ' + config.password_root,
      function (error, stdout, stderr) {
        // Imprimimos en pantalla con console.log
        let salida = stdout;
        // controlamos el error
        if (error !== null) {
          console.log('exec error: ' + error);
        }
        console.log('Salida estándar: ' + salida);

        if(callback != null){
          callback();
        }
      });

  },


  deletednat : function(ip_source, callback){
    console.log('Eliminar todo de la ip de origen ' + ip_source);
    const exec = require('child_process').exec;

    const child = exec('./sh/deletednat0.sh '+ ip_source + '  '+
        config.password_root,
      function (error, stdout, stderr) {
        // Imprimimos en pantalla con console.log
        let salida = stdout;
        // controlamos el error
        if (error !== null) {
          console.log('exec error: ' + error);
        }
        console.log('Salida estándar: ' + salida);

        if(callback != null){
          callback();
        }
    });

  },


  inicializar : function(){
    const exec = require('child_process').exec;

    const child = exec('./sh/inicializar.sh ' + config.password_root + ' ' +
        config.interfaz_exterior + ' ' + config.interfaz_interior + ' ' +
        config.ip_server_interior,
      function (error, stdout, stderr) {
        // Imprimimos en pantalla con console.log
        let salida = stdout;
        // controlamos el error
        if (error !== null) {
          console.log('exec error: ' + error);
        }
        console.log('Salida estándar: ' + salida);
    });
  },


  tcpkillestablished : function(ip_source){
    const exec = require('child_process').exec, child, salida;

    const child = exec('./sh/tcpkillestablished.sh ' + config.password_root +
        ' '+ ip_source,
      function (error, stdout, stderr) {
        // Imprimimos en pantalla con console.log
        let salida = stdout;
        // controlamos el error
        if (error !== null) {
          console.log('exec error: ' + error);
        }
        //console.log('Salida estándar: ' + salida);
    });
  }

}
