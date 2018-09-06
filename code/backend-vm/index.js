const logger = require('./logger.js');

logger.info(`Comienza la aplicacion backend`);

var config = require('./config.json');
var functions = require('./functions.js');
var MySqlAsync = require('mysql');
var sqlite3 = require('sqlite3').verbose();
// TODO Poner la base de datos en otro sitio
var db = new sqlite3.Database(__dirname + 'cloudIDE.db');
async = require("async");

var array = [];
var socket_client_servers = new Map();
var addresses = functions.getiplocal();

functions.cleandockerimages();

var bloqueo_tablas = "LOCK TABLES VMS WRITE, VMS as v1 READ, Servidores WRITE, Servidores as s1 READ, Firewall WRITE, Firewall as f1 READ, Pendientes WRITE, Pendientes as p1 READ, Asignaciones WRITE, Asignaciones as a1 READ, Cola WRITE, Cola as c1 READ";

var createnewconnection = function(){
  var connectionAsync = MySqlAsync.createPool({
    host: config.host_bbdd_mysql,
    user: config.user_bbdd_mysql,
    password: config.password_bbdd_mysql,
    database : config.database_bbdd_mysql,
    //debug : true,
    acquireTimeout : 60 * 60 * 1000,
    connectTimeout : 60 * 60 * 1000,
    connectionLimit : 1,
    queueLimit : 0
  });
  logger.debug(`una conexion creada`);

  connectionAsync.on('release', function (connection) {
    logger.debug(`Connection ${connection.threadId} released`);
});

  return connectionAsync;
}

var pool = createnewconnection();





logger.debug(`Dirección: "${addresses[0]}"`);




Set.prototype.difference = function(setB) {
    var difference = new Set(this);
    for (var elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

var puertos = new Set();
var aux=config.puerto_inicial;
for(var i=0; i<config.numero_max_serverxuser*config.numero_max_users; i++){
  puertos.add(aux);
  aux += 1;
}
var puertos_usados = new Set();
var errores = new Array();

var promesa = new Promise(function(resolve, reject) {
db.serialize(function() {
db.run('CREATE TABLE IF NOT EXISTS Asignaciones (usuario TEXT, motivo TEXT, puerto INTEGER)');

db.all(`SELECT * FROM Asignaciones`, [], (err, rows) => {
  if (err) {
    throw err;
  }
  logger.info(`longitud de filas "${rows.length}"`);

  var promesaerrores = new Promise(function(resolve, reject) {
    if( rows.length != 0){
  rows.forEach((row) => {
    logger.info(`Puerto: "${row.puerto}"`);


    var exec = require('child_process').exec, child;


    child = exec(__dirname + 'comprobarche.sh ' +config.rootpassword + ' ' + row.puerto,
      function (error, stdout, stderr) {
            if (error !== null) {
              logger.warn(`Error comprobarche: "${error}"`);
            }
            logger.debug(`comprobarche salida estandar: "${stdout}"`);

            if(stdout == "no existe\n"){
              logger.info(`no tiene nada`);
              db.run(`DELETE FROM Asignaciones WHERE puerto=?`, [row.puerto], function(err) {
                if (err) {
                  return logger.info(err.message);
                }
                errores.push({"motivo" : row.motivo, "user" : row.usuario, "puerto" :row.puerto});
              });

            }
            else{
              logger.info(`si que existe`);
              puertos_usados.add(row.puerto);
            }

            if(row == rows[rows.length-1]){//es el ultimo
              resolve();
            }

    });


  });
}
else{
  resolve();
}
});

promesaerrores.then(function(result) {
  pool.getConnection(function(err, connection) {
    connection.query(bloqueo_tablas, function(error, results, fields) {
  connection.query("SELECT * FROM Servidores AS s1", function(error, servers, fields) {
    connection.query("UNLOCK TABLES", function(error, results, fields) {
    connection.release();
  });

  if(servers.length != 0){
  async.forEach(servers, function(item, callback) {
logger.info(item);
      socket_client_servers.set(item.ip_server, require('socket.io-client')('http://'+item.ip_server+':'+config.puerto_websocket_vms, {
      reconnection : true,
      reconnectionDelay:0,
      reconnectionDelay:1000}));

      logger.info(`servidor añadido "${item.ip_server}"`);

    var ip_server = item.ip_server;
    socket_client_servers.get(item.ip_server).on('disconnect', function(){
      pool.getConnection(function(err, connection) {
      connection.query(bloqueo_tablas, function(error, results, fields) {
      connection.query("DELETE FROM Servidores WHERE ip_server='"+ip_server+"'", function(error, servers, fields) {
        connection.query("UNLOCK TABLES", function(error, results, fields) {
        connection.release();
      });
        logger.info(`servidor desconectado`);
        socket_client_servers.get(item.ip_server).disconnect();
        socket_client_servers.delete(ip_server);
      });
    });
  });
    });


    socket_client_servers.get(ip_server).on("load", function(data){
    logger.info(`recibido load "${JSON.stringify(data)}"`);
    array.push(data);
    var port = 0;

    var puertos_restantes = puertos.difference(puertos_usados);
    puertos_restantes = Array.from(puertos_restantes);
    port = puertos_restantes[0];
    puertos_usados.add(port);



    setInterval(function(){
      logger.info(`interval "${JSON.stringify(data)}"`);
      if((array[0].user == data.user) && (array[0].motivo == data.motivo)){
      clearInterval(this);
      var exec = require('child_process').exec, child, salida;


      child = exec(__dirname + 'script.sh 1 ' + data.user+"-"+data.motivo + ' ' + port + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
        function (error, stdout, stderr) {
            logger.debug(`script.sh 1 salida estandar: "${stdout}"`);
      		    if (error !== null) {
                logger.warn(`Error script.sh 1: "${error}"`);
      		    }
              functions.cleandockerimages();
      	array.shift();
      	logger.info(`pasamos al siguiente`);
          db.run(`INSERT INTO Asignaciones(usuario, motivo, puerto) VALUES(?,?,?)`, [data.user, data.motivo, port], function(err) {
            if (err) {
              return logger.info(err.message);
            }

            var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : port};
            socket_client_servers.get(ip_server).emit("loaded", json);
          });

      });

      }
      },1000);



      });



      socket_client_servers.get(ip_server).on("stop", function(data){
        array.push(data);

        setInterval(function(){
        logger.debug(`interval stop "${JSON.stringify(data)}"`);
        if((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)){
        clearInterval(this);
        var exec = require('child_process').exec, child, salida;


        child = exec(__dirname + 'script.sh 0 ' + data.user+"-"+data.motivo + ' ' + data.puerto + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
          function (error, stdout, stderr) {
              logger.debug(`script.sh 0 salida estandar: "${stdout}"`);
        		  if (error !== null) {
                logger.warn(`Error script.sh 0: "${error}"`);
        		  }
              functions.cleandockerimages();
          //puertos.add(data.puerto);
          puertos_usados.delete(data.puerto);
        	array.shift();
        	logger.info(`pasamos al siguiente`);
          db.run(`DELETE FROM Asignaciones WHERE usuario=? AND motivo=? AND puerto=?`, [data.user, data.motivo, data.puerto], function(err) {
            if (err) {
              return logger.info(err.message);
            }
            var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : data.puerto};
            socket_client_servers.get(ip_server).emit("stopped", json);
          });

        });

        }
        },1000);

      });

if(item == servers[servers.length-1]){
  if(errores.length != 0){
    async.forEach(errores, function(item, callback) {
    socket_client_servers.values().next().value.emit("stopped", item);
    logger.info(`enviando stop "${JSON.stringify(item)}"`);
    //errores.shift();
  });
  errores = [];
  }
}


  });
}
  resolve();
  });
});
});
});

  });


});
});

//// FIN SERIALIZE

promesa.then(function(){
setInterval(function(){
  pool.getConnection(function(err, connection) {
    connection.query(bloqueo_tablas, function(error, results, fields) {
  connection.query("SELECT * FROM Servidores AS s1", function(error, servers, fields) {
    connection.query("UNLOCK TABLES", function(error, results, fields) {
    connection.release();
  });
  logger.info(`buscando servidores...`);
  async.forEach(servers, function(item, callback) {

    if(socket_client_servers.get(item.ip_server) == undefined){
      var ip_server = item.ip_server;

      socket_client_servers.set(ip_server, require('socket.io-client')('http://'+item.ip_server+':'+config.puerto_websocket_vms, {
      reconnection : true,
      reconnectionDelay:0,
      reconnectionDelay:1000}));

      socket_client_servers.get(ip_server).on('disconnect', function(){
        pool.getConnection(function(err, connection) {
        connection.query(bloqueo_tablas, function(error, results, fields) {
        connection.query("DELETE FROM Servidores WHERE ip_server='"+ip_server+"'", function(error, servers, fields) {
          connection.query("UNLOCK TABLES", function(error, results, fields) {
          connection.release();
        });
          logger.info(`servidor desconectado`);
          socket_client_servers.get(item.ip_server).disconnect();
          socket_client_servers.delete(ip_server);
        });
      });
     });

      });

      socket_client_servers.get(ip_server).on("load", function(data){
        logger.info(`recibido load "${JSON.stringify(data)}"`);
        array.push(data);
        var port = 0;

        var puertos_restantes = puertos.difference(puertos_usados);
        puertos_restantes = Array.from(puertos_restantes);
        port = puertos_restantes[0];
        puertos_usados.add(port);



        setInterval(function(){
          logger.info(`interval "${JSON.stringify(data)}"`);
          if((array[0].user == data.user) && (array[0].motivo == data.motivo)){
          clearInterval(this);
          var exec = require('child_process').exec, child, salida;


          child = exec(__dirname + 'script.sh 1 ' + data.user+"-"+data.motivo + ' ' + port + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
            function (error, stdout, stderr) {
              logger.debug(`script.sh 1 salida estandar: "${stdout}"`);
      		        if (error !== null) {
                    logger.warn(`Error script.sh 1: "${error}"`);
          		    }
                  functions.cleandockerimages();
          	array.shift();
          	logger.info(`pasamos al siguiente`);
              db.run(`INSERT INTO Asignaciones(usuario, motivo, puerto) VALUES(?,?,?)`, [data.user, data.motivo, port], function(err) {
                if (err) {
                  return logger.info(err.message);
                }

                var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : port};
                socket_client_servers.get(ip_server).emit("loaded", json);
              });

          });

          }
          },1000);



      });



      socket_client_servers.get(ip_server).on("stop", function(data){
        array.push(data);

        setInterval(function(){
        logger.info(`interval stop "${JSON.stringify(data)}"`);
        if((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)){
        clearInterval(this);
        var exec = require('child_process').exec, child, salida;


        child = exec(__dirname + 'script.sh 0 ' + data.user+"-"+data.motivo + ' ' + data.puerto + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
          function (error, stdout, stderr) {
              logger.debug(`script.sh 0 salida estandar: "${stdout}"`);
      		    if (error !== null) {
                logger.warn(`Error script.sh 0: "${error}"`);
        		  }
              functions.cleandockerimages();
          //puertos.add(data.puerto);
          puertos_usados.delete(data.puerto);
        	array.shift();
        	logger.info(`pasamos al siguiente`);
          db.run(`DELETE FROM Asignaciones WHERE usuario=? AND motivo=? AND puerto=?`, [data.user, data.motivo, data.puerto], function(err) {
            if (err) {
              return logger.info(err.message);
            }
            var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : data.puerto};
            socket_client_servers.get(ip_server).emit("stopped", json);
          });

        });

        }
        },1000);

      });

      logger.info(`Server añadido`);
    }

    if(item == servers[servers.length-1]){
      if(errores.length != 0){
        async.forEach(errores, function(item, callback) {
        socket_client_servers.values().next().value.emit("stopped", item);
        logger.info(`enviando stop "${JSON.stringify(item)}"`);
        //errores.shift();
      });
      errores = [];
      }
    }

  });

});
});
});
}, config.tiempo_actualizacion);

});



setInterval(function(){
  functions.cleandockerimages();
}, 900000);
