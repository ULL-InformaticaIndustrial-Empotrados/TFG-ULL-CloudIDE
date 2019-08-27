const express = require('express');
const bodyParser = require('body-parser');
const sio = require('socket.io');
const sioC = require('socket.io-client');

const logger = require('./logger.js').child({ label: 'index' });

logger.info('Comienza la aplicacion portal');

const config = require('./config.json');
const functions = require('./functions.js');
const firewall = require('./firewall.js');
const db = require('./database.js');

// async = require("async");
const ovirt = require('./ovirt.js');
const sesion = require('./sesion.js');

const serv = require('./servidores.js');
const cli = require('./clientes.js');
const vms = require('./vms.js');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/cloud', express.static('./client/views'));
app.use('/', express.static('./client/views'));

app.set('views', './client/views'); // Configuramos el directorio de vistas
app.set('view engine', 'ejs');

firewall.inicializar(); // borramos iptables anteriores

// Funcion-promesa para determinar rol del usuario
async function getRoll(user) {
  const consulta = `SELECT count(*) as total FROM Profesores WHERE usuario='${user}'`;
  logger.debug(`Obetemos roll con consulta: "${consulta}"`);
  try {
    const pool = await db.pool;
    const result = await pool.query(consulta);
    logger.debug(`Resultado consulta roll: ${JSON.stringify(result, null, 2)}`);
    if (result[0].total === 1) return 'profesor';
  } catch (error) {
    logger.warn(`Error al consultar roll: ${error}`);
  }
  return 'alumno';
}

const wsVMs = sio(config.puerto_wsVMs, {
  pingTimeout: 3000,
  pingInterval: 3000,
});

const n = config.numero_max_serverxuser;
// const maxusers = config.numero_max_users;
sesion.createsession(app, cli.wsClient); // creamos la sesion
// AUTENTICACION POR CAS ULL
const CASAuthentication = require('./cas-authentication.js');

// Create a new instance of CASAuthentication.
const cas = new CASAuthentication({
  cas_url: 'https://login.ull.es/cas-1',
  service_url: 'http://cloudide.iaas.ull.es',
  session_info: 'cas_userinfo',
  destroy_session: false,
});


// Funcion vmfree
async function vmfree() {
  logger.info('Entramos vmfree');
  const pool = await db.pool;
  const conexion = await pool.getConnection();
  await conexion.query(db.bloqueoTablas);
  const nEnCola = (await conexion.query(`SELECT COUNT(*)
    AS total FROM Cola AS c1`))[0].total;
  const nVMs = (await conexion.query(`SELECT COUNT(*)
    AS total FROM VMS AS v1`))[0].total;

  if ((nVMs !== 0) && (nEnCola !== 0)) {
    logger.info('Existen vm libres y hay motivos en cola');
    const { usuario } = (await conexion.query('SELECT * FROM Cola AS c1 LIMIT 1'))[0];
    const motivos = await conexion.query(`SELECT * FROM Cola AS c1
      WHERE usuario='${usuario}'`);
    const ipVM = (await conexion.query(`SELECT * FROM VMS AS v1
      ORDER BY prioridad ASC LIMIT 1`))[0].ip_vm;
    if (vms.mapIpVMS.get(ipVM) !== undefined) {
      logger.debug(`La máquina ${ipVM} tiene socket (está activa)`);
      for (const item of motivos) {
        logger.info(`Asignamos (${usuario}, ${item.motivo}) a máquina ${ipVM}`);
        await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
          VALUES ('${ipVM}', '${item.motivo}', '${usuario}', 'up')`);
        const json = { user: usuario, motivo: item.motivo };
        vms.getSocketFromIP(ipVM).emit('load', json);
      }
    } else {
      const cola_user = conexion.query('SELECT * FROM Cola AS c1 LIMIT 1');
      const cola_vm = conexion.query('SELECT * FROM VMS AS v1 ORDER BY prioridad ASC LIMIT 1');
      const numero_users_vm = conexion.query(`SELECT count(DISTINCT usuario) AS total
        FROM (SELECT DISTINCT usuario from Asignaciones WHERE ip_vm='${cola_vm[0].ip_vm}'
        UNION SELECT DISTINCT usuario FROM Pendientes WHERE ip_vm='${cola_vm[0].ip_vm}') AS tmp`);
      logger.info(`tiene "${numero_users_vm[0].total}" usuarios la maquina virtual`);
      if (numero_users_vm[0].total === config.numero_max_users) {
        await conexion.query(`DELETE FROM VMS WHERE ip_vm='${cola_vm[0].ip_vm}'`);
      } else {
        await conexion.query(`UPDATE VMS SET prioridad=0 WHERE ip_vm='${cola_vm[0].ip_vm}'`);
        logger.info('actualizamos vm');
      }

      await conexion.query(`DELETE FROM Cola WHERE usuario='${cola_user[0].usuario}'`);
      logger.info('enviado a vm');
    }
  }
  await conexion.query('UNLOCK TABLES');
  await conexion.release();
  vmfree();
}
// FIN Funcion vmfree

// //////////////////"/ Firewall

firewall.firewall();

//  ///////////////////



//WEBSOCKET////////////////////////////




 wsVMs.on('connection', function (socket) {

   var ipvm = functions.cleanAddress(socket.handshake.address);
   logger.info(`Conexión de "${socket.id}" Con ip "${ipvm}"`);

   //vms.mapIpVMS.set(ipvm, socket);
   if(vms.mapIpVMS.get(ipvm) == undefined){
     vms.mapIpVMS.set(ipvm, new Array());
   }
   var aux = vms.mapIpVMS.get(ipvm);
   aux.push(socket);
   vms.mapIpVMS.set(ipvm, aux);

   logger.info(`vms.mapIpVMS tiene longitud > "${vms.mapIpVMS.size}"`);

   pool.getConnection(function(err, connection) {
   var conexion = connection;
   conexion.query(db.bloqueoTablas,function(error, results, fields) {

     conexion.query("SELECT * FROM Ovirt_Pendientes as ovp WHERE ip_vm='"+ipvm+"'",function(error, existe_pendientes_ovirt, fields) {
       var bool = true;
    var promesaovirt = new Promise(function(resolve, reject) {
       if(existe_pendientes_ovirt.length != 0){
         if(existe_pendientes_ovirt[0].tipo == 'down'){
           bool = false;
           resolve();
         }
         else{
           conexion.query("DELETE FROM Ovirt_Pendientes WHERE ip_vm='"+ipvm+"'",function(error, results, fields) {
             resolve();
           });
         }

       }
       else{
         resolve();
       }
     });

       promesaovirt.then(function(result) {
         if(bool == true){
     conexion.query("SELECT COUNT(*) AS total FROM VMS as v1 WHERE ip_vm='"+ipvm+"'",function(error, existe, fields) {
       var promesaprimera = new Promise(function(resolve, reject) {
       if(existe[0].total == 0){
         conexion.query("SELECT count(DISTINCT usuario) AS total FROM (SELECT DISTINCT usuario from Asignaciones as a1 WHERE ip_vm='"+ipvm+"' UNION SELECT DISTINCT usuario FROM Pendientes as p1 WHERE ip_vm='"+ipvm+"') AS tmp",function(error, numero_users_vm, fields) {
           logger.info(`tiene "${numero_users_vm[0].total} usuarios la maquina virtual`);
           if(numero_users_vm[0].total == 0){
             connection.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (1,'"+ipvm+"')", function(error, results, fields) {
               resolve();
             });
           }
           else if(numero_users_vm[0].total < config.numero_max_users){

             connection.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (0,'"+ipvm+"')", function(error, results, fields) {
               resolve();
             });

           }
           else{
             resolve();
           }



           });
       }
       else{
         resolve();
       }
     });

        promesaprimera.then(function(result) {
         logger.info(`Una VM ha arrancado`);
           conexion.query("SELECT COUNT(*) AS total FROM VMS as v1",function(error, vms_, fields) {
               conexion.query("SELECT COUNT(*) AS total FROM Cola as c1",function(error, total_cola, fields) {
                 logger.info(`tiene "${vms_[0].total}" "${total_cola[0].total}"`);
                 if((vms_[0].total != 0)&&(total_cola[0].total != 0)){
                     conexion.query("SELECT * FROM Cola as c1 LIMIT 1",function(error, cola_user, fields) {
                       conexion.query("SELECT * FROM Cola as c1 WHERE usuario='"+cola_user[0].usuario+"'",function(error, cola_user1, fields) {
                           conexion.query("SELECT * FROM VMS as v1 ORDER BY prioridad ASC LIMIT 1",function(error, cola_vm, fields) {

                             if(vms.mapIpVMS.get(cola_vm[0].ip_vm) != undefined){
                             var promise5 = new Promise(function(resolve, reject) {
                               async.forEach(cola_user1, function(item, callback) {

                                   conexion.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+cola_vm[0].ip_vm+"', '"+item.motivo+"','"+cola_user[0].usuario+"', 'up')",function(error, results, fields) {
                                     var json = {"user" : cola_user[0].usuario, "motivo" : item.motivo};
                                     vms.getSocketFromIP(cola_vm[0].ip_vm).emit("load", json);
                                     if(item == cola_user1[cola_user1.length-1]){
                                       resolve();
                                     }
                                   });


                                 });



                                   }, function(err) {
                                       if (err) logger.info(err);}
                                 );

                               promise5.then(function(result) {

                                     conexion.query("SELECT count(DISTINCT usuario) AS total FROM (SELECT DISTINCT usuario from Asignaciones as a1 WHERE ip_vm='"+cola_vm[0].ip_vm+"' UNION SELECT DISTINCT usuario FROM Pendientes as p1 WHERE ip_vm='"+cola_vm[0].ip_vm+"') AS tmp",function(error, numero_users_vm, fields) {
                                       logger.info(`tiene "${numero_users_vm[0].total}" usuarios la maquina virtual`);
                                       if(numero_users_vm[0].total == config.numero_max_users){
                                       conexion.query("DELETE FROM VMS WHERE ip_vm='"+cola_vm[0].ip_vm+"'",function(error, cola_vm, fields) {

                                           conexion.query("DELETE FROM Cola WHERE usuario='"+cola_user[0].usuario+"'",function(error, results, fields) {
                                             logger.info(`enviado a vm`);
                                             conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                             conexion.release();

                                             vmfree();
                                             ajustaVMArrancadas();
                                           });
                                           });
                                             });
                                       }
                                       else{

                                         conexion.query("UPDATE VMS SET prioridad=0 WHERE ip_vm='"+cola_vm[0].ip_vm+"'",function(error, results, fields) {
                                           logger.info(`actualizamos vm`);

                                           conexion.query("DELETE FROM Cola WHERE usuario='"+cola_user[0].usuario+"'",function(error, results, fields) {
                                             logger.info(`enviado a vm`);
                                             conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                             conexion.release();

                                             vmfree();
                                             ajustaVMArrancadas();
                                           });

                                           });
                                         });

                                       }



                                       });




                                   }, function(err) {
                                     logger.info(err);
                                   });

                                 }
                                 else{
                                   conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                   conexion.release();

                                   //ajustaVMArrancadas();
                                 });

                                 }

                                 });
                                 });
                                 });
                               }

                               else{
                                 conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                 conexion.release();
                                 ajustaVMArrancadas();

                               });
                               }
                           });
                         });
                       });
                       });
                     }
                     else{
                    conexion.query("UNLOCK TABLES",function(error, results, fields) {
                       conexion.release();
                       ajustaVMArrancadas();
                     });
                     }
                     });
                     });
                   });
                   });





    socket.on('disconnect', function () {
      logger.info(`VM disconnected "${ipvm}"`);

        if(vms.mapIpVMS.get(ipvm)!= undefined){
          if(vms.mapIpVMS.get(ipvm).length != 0){
        vms.mapIpVMS.get(ipvm)[0].disconnect();
        vms.mapIpVMS.get(ipvm).shift();
        if(vms.mapIpVMS.get(ipvm).length == 0){
          vms.mapIpVMS.delete(ipvm);
          pool.getConnection(function(err, connection) {
          var conexion = connection;
          conexion.query(db.bloqueoTablas,function(error, results, fields) {
          conexion.query("DELETE FROM VMS WHERE ip_vm='"+ipvm+"'",function(error, result, fields) {

            conexion.query("UNLOCK TABLES",function(error, results, fields) {
              logger.debug(`liberando tablas MySQL`);
            conexion.release();

          });
        });
      });
    });
        }
      }
    }
    comprobarservidor();

});




socket.on('loaded', function (data) {
  logger.info(`Che server loaded "${JSON.stringify(data)}"`);
  pool.getConnection(function(err, connection) {
  var conexion = connection;

  var promise = new Promise(function(resolve, reject) {
  conexion.query(db.bloqueoTablas,function(error, results, fields) {
  conexion.query("SELECT * FROM Pendientes AS p1 WHERE ip_vm='"+ipvm+"' AND motivo='"+data.motivo+"' AND usuario='"+data.user+"'",function(error, pen, fields) {


      if(pen.length != 0){
          conexion.query("INSERT INTO Asignaciones (ip_vm, usuario, motivo, puerto) VALUES ('"+ipvm+"','"+pen[0].usuario+"','"+pen[0].motivo+"',"+data.puerto+")",function(error, results, fields) {
          //pendientes[i].client.emit("resultado", pendientes[i].motivo+" "+pendientes[i].vm+':'+arreglo[1] );

          logger.info(`es del usuario "${pen[0].usuario}"`);
          conexion.query("SELECT COUNT(*) AS total FROM Asignaciones AS a1 WHERE usuario='"+pen[0].usuario+"'",function(error, row, fields) {
            conexion.query("SELECT ip_origen FROM Firewall AS f1 WHERE usuario='"+pen[0].usuario+"'",function(error, firewall1, fields) {
              if(error) logger.info(error);

              if((row[0].total > 1) && (firewall1.length != 0)){ //Ya hay dentro

                var min = 0;
                var max = firewall1.length;

                var bucle = function(){
                  if(min < max){
                      serv.broadcastServers("añadirsolo", {"ip_origen" : firewall1[min].ip_origen, "ipvm" : ipvm, "puerto" : data.puerto});
                      firewall.dnatae("añadirsolo", firewall1[min].ip_origen, ipvm, data.puerto, function(){
                        min++;
                        bucle();
                      });
                    }
                  else{
                    if(mapUserSocket.get(pen[0].usuario) != undefined){
                      cli.broadcastClient(pen[0].usuario, "resultado", {"motivo" : data.motivo} );
                    }
                    else{
                      serv.broadcastServers("enviar-resultado", {"motivo" : data.motivo, "user" : data.user});
                    }
                    conexion.query("DELETE FROM Pendientes WHERE usuario='"+pen[0].usuario+"' AND motivo='"+pen[0].motivo+"' AND tipo='up'",function(error, results, fields) {
                      logger.info(`pendiente realizado`);
                      resolve();
                    });
                  }

                }
                bucle();
              }
              else if((firewall1.length != 0)){ //es el primero
                logger.info(`firewall primero`);

                var min = 0;
                var max = firewall1.length;

                var bucle = function(){
                  if(min < max){
                    serv.broadcastServers("añadircomienzo", {"ip_origen" : firewall1[min].ip_origen, "ipvm" : ipvm, "puerto" : data.puerto});
                    firewall.dnatae("añadircomienzo", firewall1[min].ip_origen, ipvm, 0, function(){
                      serv.broadcastServers("añadirsolo", {"ip_origen" : firewall1[min].ip_origen, "ipvm" : ipvm, "puerto" : data.puerto});
                      firewall.dnatae("añadirsolo", firewall1[min].ip_origen, ipvm, data.puerto, function(){
                        min++;
                        bucle();
                      });
                    });
                    }
                  else{
                    if(mapUserSocket.get(pen[0].usuario) != undefined){
                      cli.broadcastClient(pen[0].usuario, "resultado", {"motivo" : data.motivo} );
                    }
                    else{
                      serv.broadcastServers("enviar-resultado", {"motivo" : data.motivo, "user" : data.user});
                    }
                    conexion.query("DELETE FROM Pendientes WHERE usuario='"+pen[0].usuario+"' AND motivo='"+pen[0].motivo+"' AND tipo='up'",function(error, results, fields) {
                      logger.info(`pendiente realizado`);
                      resolve();
                    });
                  }

                }
                bucle();

              }
              else{
                conexion.query("DELETE FROM Pendientes WHERE usuario='"+pen[0].usuario+"' AND motivo='"+pen[0].motivo+"' AND tipo='up'",function(error, results, fields) {
                  logger.info(`pendiente realizado`);
                  resolve();
                });
              }



          });
        });
      });
      }
      else{
        resolve();
      }

    });
    });
    });



    promise.then(function(result) {
      conexion.query("SELECT COUNT(*) AS total FROM (SELECT motivo FROM `Eliminar_servicio_usuario` as esu WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"' UNION SELECT motivo FROM Eliminar_servicio as es WHERE motivo='"+data.motivo+"') AS alias",function(error, total, fields) {
        if(total[0].total != 0){
          if(vms.mapIpVMS.get(ipvm) != undefined){
            var socket_vm = vms.getSocketFromIP(ipvm);
            conexion.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+ipvm+"', '"+data.motivo+"','"+data.user+"', 'down')",function(error, results2, fields) {
              var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : data.puerto};
              socket_vm.emit("stop", json);
                logger.info(`enviado stop`);
                conexion.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                conexion.release();

              });
            });
          }
          else{
            conexion.query("UNLOCK TABLES",function(error, results, fields) {
              logger.debug(`liberando tablas MySQL`);
            conexion.release();

          });
          }
        }
        else{
          conexion.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
            if(result[0].total != 0){
              if(vms.mapIpVMS.get(ipvm) != undefined){
                var socket_vm = vms.getSocketFromIP(ipvm);
                conexion.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+ipvm+"', '"+data.motivo+"','"+data.user+"', 'down')",function(error, results2, fields) {
                  var json = {"user" : data.user, "motivo" : data.motivo, "puerto" : data.puerto};
                  socket_vm.emit("stop", json);
                    logger.info(`enviado stop`);
                    conexion.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    conexion.release();

                  });
                });
              }
              else{
                conexion.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                conexion.release();

              });
              }

            }
            else{
              conexion.query("UNLOCK TABLES",function(error, results, fields) {
                logger.debug(`liberando tablas MySQL`);
              conexion.release();

            });
            }
          });
        }
      });



    }, function(err) {
      logger.info(err);
    });
});

});



    socket.on('stopped', function (data) {
      logger.info(`Che server stopped "${JSON.stringify(data)}"`);
      pool.getConnection(function(err, connection) {
      var conexion = connection;
      conexion.query(db.bloqueoTablas,function(error, results, fields) {
        conexion.query("SELECT * FROM Asignaciones AS a1 WHERE ip_vm='"+ipvm+"' AND motivo='"+data.motivo+"' AND usuario='"+data.user+"'",function(error, asignaciones, fields) {
          logger.info(`tamaño "${asignaciones.length}"`);

            var promise = new Promise(function(resolve, reject) {
                if(asignaciones.length != 0){
                  conexion.query("DELETE FROM Asignaciones WHERE motivo='"+asignaciones[0].motivo+"' AND usuario='"+asignaciones[0].usuario+"'",function(error, results, fields) {
                      conexion.query("DELETE FROM Pendientes WHERE usuario='"+asignaciones[0].usuario+"' AND motivo='"+asignaciones[0].motivo+"' AND tipo='down'",function(error, results, fields) {
                        conexion.query("SELECT count(DISTINCT usuario) AS total FROM (SELECT DISTINCT usuario from Asignaciones as a1 WHERE ip_vm='"+asignaciones[0].ip_vm+"' UNION SELECT DISTINCT usuario FROM Pendientes as p1 WHERE ip_vm='"+asignaciones[0].ip_vm+"') AS tmp",function(error, numero_users_vm, fields) {
                          conexion.query("SELECT count(*) AS total FROM VMS AS v1 WHERE ip_vm='"+asignaciones[0].ip_vm+"'",function(error, existe_vm, fields) {
                            var promise2 = new Promise(function(resolve, reject) {
                              logger.info(`tiene "${numero_users_vm[0].total}"`);
                              if(numero_users_vm[0].total == 0){
                                if(existe_vm[0].total != 0){
                                  logger.info(`liberando vm...`);

                                conexion.query("UPDATE VMS SET prioridad=1 WHERE ip_vm='"+ipvm+"'",function(error, results, fields) {
                                  resolve();
                                });
                              }
                              else{
                                logger.info(`liberando vm...`);

                              conexion.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (1,'"+ipvm+"')",function(error, results, fields) {
                                resolve();
                              });
                              }
                              }
                              else if(numero_users_vm[0].total < config.numero_max_users){
                                if(existe_vm[0].total != 0){
                                logger.info(`actualizo vm`);
                                conexion.query("UPDATE VMS SET prioridad=0 WHERE ip_vm='"+ipvm+"'",function(error, results, fields) {
                                  if(error) logger.info(error);
                                  resolve();
                                });
                              }
                              else{
                                logger.info(`actualizo vm`);
                                conexion.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (0,'"+ipvm+"')",function(error, results, fields) {
                                  if(error) logger.info(error);
                                  resolve();
                                });
                              }
                              }
                              else{
                                resolve();
                              }
                            });

                            promise2.then(function(result) {

                              conexion.query("SELECT COUNT(*) AS total FROM Asignaciones AS a1 WHERE usuario='"+asignaciones[0].usuario+"'",function(error, total_asignaciones_user, fields) {
                                conexion.query("SELECT ip_origen FROM Firewall AS f1 WHERE usuario='"+asignaciones[0].usuario+"'",function(error, firewall1, fields) {
                                  if(firewall1.length != 0){
                                    if(total_asignaciones_user[0].total != 0){

                                      var min = 0;
                                      var max = firewall1.length;

                                      var bucle = function(){
                                        if(min < max){
                                          serv.broadcastServers("dnatae-eliminarsolo", {"ip_origen" : firewall1[min].ip_origen, "ipvm" : asignaciones[0].ip_vm, "puerto" : data.puerto});
                                          firewall.dnatae("eliminarsolo", firewall1[min].ip_origen, asignaciones[0].ip_vm, data.puerto, function(){
                                            min++;
                                            bucle();
                                          });

                                        }
                                        else{
                                          if(mapUserSocket.get(asignaciones[0].usuario) != undefined){
                                            cli.broadcastClient(asignaciones[0].usuario, "stop", {"motivo" : asignaciones[0].motivo});
                                          }
                                          else{
                                            serv.broadcastServers("enviar-stop", {"user" : asignaciones[0].usuario, "motivo" : asignaciones[0].motivo});
                                          }
                                          resolve();
                                        }

                                      }
                                      bucle();
                                    }
                                    else{
                                      logger.info(`eliminar por completo`);

                                      var min = 0;
                                      var max = firewall1.length;

                                      var bucle = function(){
                                        if(min < max){
                                          serv.broadcastServers("deletednat", firewall1[min].ip_origen);
                                          firewall.deletednat(firewall1[min].ip_origen, function(){
                                            min++;
                                            bucle();
                                          });

                                        }
                                        else{
                                          if(mapUserSocket.get(asignaciones[0].usuario) != undefined){
                                            cli.broadcastClient(asignaciones[0].usuario, "stop", {"motivo" : asignaciones[0].motivo});
                                          }
                                          else{
                                            serv.broadcastServers("enviar-stop", {"user" : asignaciones[0].usuario, "motivo" : asignaciones[0].motivo});
                                          }

                                          resolve();
                                        }

                                      }
                                      bucle();
                                    }
                                  }
                                  else{
                                    resolve();
                                  }

                                });
                              });

                            }, function(err) {
                              logger.info(err);
                            });
                          });
                          });
                      });
                  });
                }
                else{
                  resolve();
                }
            });

            promise.then(function(result) {

              conexion.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+data.motivo+"'",function(error, total, fields) {
                if(total[0].total != 0){

                  conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                    conexion.query("DELETE FROM Matriculados WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                      conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                        conexion.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                          if(result[0].total == 0){
                            functions.eliminardirectoriotodo(data.motivo, function(){
                              pool.getConnection(function(err, connection) {
                                connection.query(db.bloqueoTablas,function(error, results, fields) {
                                  connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                                    connection.query("DELETE FROM Servicios WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                                      connection.query("UNLOCK TABLES",function(error, results, fields) {
                                        connection.release();
                                      });
                                    });
                                  });
                                });
                              });
                            });
                            conexion.query("UNLOCK TABLES",function(error, results, fields) {
                              logger.debug(`liberando tablas MySQL`);
                            conexion.release();

                            vmfree();
                            ajustaVMArrancadas();
                          });
                          }
                          else{
                            conexion.query("UNLOCK TABLES",function(error, results, fields) {
                              logger.debug(`liberando tablas MySQL`);
                            conexion.release();

                            vmfree();
                            ajustaVMArrancadas();
                          });
                          }
                        });
                      });
                    });
                  });

                }
                else{
                  conexion.query("SELECT COUNT(*) AS total FROM (SELECT motivo FROM `Eliminar_servicio_usuario` as esu WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"' UNION SELECT motivo FROM Eliminar_servicio as es WHERE motivo='"+data.motivo+"') AS alias",function(error, result, fields) {
                    if(result[0].total != 0){




                      functions.eliminardirectoriosolo(data.user, data.motivo, function(){
                        pool.getConnection(function(err, conexion) {
                          conexion.query(db.bloqueoTablas,function(error, results, fields) {
                            conexion.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                              if(result[0].total == 0){
                                conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                  conexion.query("DELETE FROM Matriculados WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                    conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                        conexion.release();
                                      });
                                    });
                                  });
                                });
                              }
                              else{
                                conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                  conexion.query("DELETE FROM Matriculados WHERE usuario='"+data.user+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                    conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+data.motivo+"'",function(error, result, fields) {
                                      conexion.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                                        if(result[0].total == 0){
                                          functions.eliminardirectoriotodo(req.body['nombreservicio'], function(){
                                            pool.getConnection(function(err, connection) {
                                              connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                                                  connection.query("DELETE FROM Servicios WHERE motivo='"+data.motivo+"'",function(error, result, fields) {
                                                    connection.query("UNLOCK TABLES",function(error, results, fields) {
                                                      connection.release();
                                                    });
                                                  });
                                                });
                                              });
                                            });
                                          });
                                          conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                            conexion.release();
                                          });
                                        }
                                        else{
                                          conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                            conexion.release();
                                          });
                                        }
                                      });
                                    });
                                  });
                                });
                              }
                          });
                        });
                      });
                    });

                    conexion.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    conexion.release();

                    vmfree();
                    ajustaVMArrancadas();
                  });


                    }
                    else{
                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                        logger.debug(`liberando tablas MySQL`);
                      conexion.release();

                      vmfree();
                      ajustaVMArrancadas();
                    });
                    }
                  });
                }
              });







            }, function(err) {
              logger.info(err);
            });
          });
        });
    });
      });
    });


////////////////////////////////////////


/// RUTAS WEB ////////////////////////////


app.get('/', function(req,res){
var ip_origen = functions.cleanAddress(req.connection.remoteAddress);
  if(req.session.user == undefined){
    serv.broadcastServers('deletednat', ip_origen);
    firewall.deletednat(ip_origen, function(){
      pool.getConnection(function(err, connection) {
      var conexion = connection;
      conexion.query("DELETE FROM Firewall WHERE ip_origen='"+functions.cleanAddress(req.connection.remoteAddress)+"'",function(error, results, fields) {
        conexion.release();
        res.render('index', {});
      });
    });
  });
  }
  else{
    if(ip_origen != req.session.ip_origen){ //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
    res.redirect('/controlpanel');
  }
  }

});

app.get('/controlpanel', function(req,res){
  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);
if(req.session.user != undefined){
  if(ip_origen != req.session.ip_origen){ //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
    res.redirect('/logout');
  }
  else{
  logger.info(`Es usuario "${req.session.user}"`);
  if(req.session.rol == "profesor"){
    pool.getConnection(function(err, connection) {
    var conexion = connection;
    conexion.query("SELECT * FROM Matriculados NATURAL JOIN Asignaciones WHERE usuario='"+req.session.user+"' AND motivo NOT IN ( SELECT motivo FROM Pendientes WHERE tipo='down' AND usuario='"+req.session.user+"')",function(error, upped, fields) {
      conexion.query("SELECT * FROM Matriculados NATURAL JOIN Asignaciones NATURAL JOIN Pendientes WHERE usuario='"+req.session.user+"'",function(error, dowing, fields) {
        conexion.query("SELECT usuario, motivo FROM Matriculados NATURAL JOIN Pendientes WHERE usuario='"+req.session.user+"' AND tipo='up' UNION ALL SELECT usuario, motivo FROM Matriculados NATURAL JOIN Cola WHERE usuario='"+req.session.user+"'",function(error, upping, fields) {
          conexion.query("SELECT * FROM Matriculados WHERE usuario='"+req.session.user+"' AND motivo NOT IN (SELECT motivo FROM Pendientes WHERE usuario='"+req.session.user+"' UNION SELECT motivo FROM Asignaciones WHERE usuario='"+req.session.user+"' UNION SELECT motivo FROM Cola WHERE usuario='"+req.session.user+"')",function(error, rest, fields) {
            conexion.query("SELECT motivo FROM Servicios WHERE usuario='"+req.session.user+"' AND motivo NOT IN (SELECT motivo FROM Eliminar_servicio)",function(error, motivos, fields) {
              var tservicios = [];
              var max = motivos.length;
              var min = 0;

              var bucle = function(){
                if(min < max){
                  conexion.query("SELECT * FROM Matriculados NATURAL JOIN Ultima_conexion WHERE motivo='"+motivos[min].motivo+"' AND usuario NOT IN ( SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='"+motivos[min].motivo+"')",function(error, result, fields) {
                    conexion.query("SELECT usuario FROM Asignaciones WHERE motivo='"+motivos[min].motivo+"'",function(error, result2, fields) {
                      var set = new Set();
                      var usuarios = [];
                      for(var j=0; j<result2.length; j++){
                        set.add(result2[j].usuario);
                      }
                      for(var i=0; i<result.length; i++){
                        if(set.has(result[i].usuario)){
                          var a = {"usuario":result[i].usuario, "estado":"up", "fecha" : result[i].fecha}
                          usuarios.push(a);
                        }
                        else{
                          var a = {"usuario":result[i].usuario, "estado":"down", "fecha" : result[i].fecha}
                          usuarios.push(a);
                        }
                      }
                      var aux = {"motivo" : motivos[min].motivo, "usuarios" : usuarios};
                      tservicios.push(aux);
                      min++;
                      bucle();
                    });
                  });
                }
                else{
                  conexion.release();
                  res.render('controlpanelprofesor', {ip_server_che: config.ip_server_exterior, user : req.session.user, encendidos : upped, apagandose : dowing, encendiendose : upping, resto : rest, servicios : tservicios});
                }
              }

              bucle();
            });
          });
        });
      });
    });
  });
  }
  else{
    pool.getConnection(function(err, connection) {
    var conexion = connection;
    conexion.query("SELECT * FROM Matriculados NATURAL JOIN Asignaciones WHERE usuario='"+req.session.user+"' AND motivo NOT IN ( SELECT motivo FROM Pendientes WHERE tipo='down' AND usuario='"+req.session.user+"')",function(error, upped, fields) {
      conexion.query("SELECT * FROM Matriculados NATURAL JOIN Asignaciones NATURAL JOIN Pendientes WHERE usuario='"+req.session.user+"'",function(error, dowing, fields) {
        conexion.query("SELECT usuario, motivo FROM Matriculados NATURAL JOIN Pendientes WHERE usuario='"+req.session.user+"' AND tipo='up' UNION ALL SELECT usuario, motivo FROM Matriculados NATURAL JOIN Cola WHERE usuario='"+req.session.user+"'",function(error, upping, fields) {
          conexion.query("SELECT * FROM Matriculados WHERE usuario='"+req.session.user+"' AND motivo NOT IN (SELECT motivo FROM Pendientes WHERE usuario='"+req.session.user+"' UNION SELECT motivo FROM Asignaciones WHERE usuario='"+req.session.user+"' UNION SELECT motivo FROM Cola WHERE usuario='"+req.session.user+"')",function(error, rest, fields) {
            conexion.release();
            res.render('controlpanelalumno', {ip_server_che: config.ip_server_exterior, user : req.session.user, encendidos : upped, apagandose : dowing, encendiendose : upping, resto : rest});
          });
        });
      });
    });
  });
  }
}
}
else{
res.redirect('/');
}
});

app.get('/cloud/:motivo', function(req,res){
  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);
  if(req.session.user != undefined){
    if(ip_origen != req.session.ip_origen){ //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
    pool.getConnection(function(err, connection) {
      var conexion = connection;
      conexion.query("SELECT * FROM Asignaciones WHERE usuario='"+req.session.user+"' AND motivo='"+req.params.motivo+"'", function(err, row) {
        if (err) throw err;
        conexion.release();
        if(row.length != 0){
          conexion.query("UPDATE Ultima_conexion SET fecha='"+functions.dateFormat()+"' WHERE usuario='"+req.session.user+"' AND motivo='"+req.params.motivo+"'",function(error, result, fields) {
            res.render('cloud', {user : req.session.user, motivo : req.params.motivo, ip_server_che : config.ip_server_exterior, port_server_che : row[0].puerto});
          });
        }
        else{
          res.render('error', {});
        }
      });
  });
}
  }
  else{
    res.redirect('/');
  }

});

app.get('/autenticacion', cas.bounce, function(req,res){
var ip_origen = functions.cleanAddress(req.connection.remoteAddress);

  if(req.session.user != undefined){
    if(ip_origen != req.session.ip_origen){ //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
      res.redirect('/');
    }
  }
    else{

//borrar iptables de esta ip por si acaso
      serv.broadcastServers('deletednat', ip_origen);
      firewall.deletednat(ip_origen, function(){
      pool.getConnection(function(err, connection) {
        var conexion = connection;
        conexion.query("DELETE FROM Firewall WHERE ip_origen='"+ip_origen+"'",function(error, results, fields) {


          req.session.user = req.session["cas_userinfo"].username;

  //req.session.user = req.session["cas_userinfo"].username;
  req.session.ip_origen = ip_origen;
  getRoll(req.session.user)
  .then((rol) => {
    logger.info(`Usuario considerado "${rol}"`);
    req.session.rol = rol;
  })
  .then(() => {
    conexion.query("INSERT INTO Firewall (usuario, ip_origen) VALUES ('"+req.session.user+"','"+ip_origen+"')",function(error, results, fields) {

      //Actualizamos iptables
      conexion.query("SELECT ip_vm, puerto FROM Asignaciones WHERE usuario='"+req.session.user+"'", function(err,row){

        conexion.release();

        if(err) logger.info(err);

        var min = 0;
        var max = row.length;

        var bucle = function(){
          if(min < max){
            if(min == 0){
              serv.broadcastServers("añadircomienzo", ip_origen +" "+ row[min].ip_vm +" "+ row[min].puerto)
              firewall.dnatae("añadircomienzo", ip_origen, row[min].ip_vm, 0, function(){
                serv.broadcastServers("añadirsolo", ip_origen +" "+ row[min].ip_vm +" "+ row[min].puerto);
                firewall.dnatae("añadirsolo", ip_origen, row[min].ip_vm, row[min].puerto, function(){
                  min++;
                  bucle();
                });
              });
            }
            else{
              serv.broadcastServers("añadirsolo", ip_origen +" "+ row[min].ip_vm +" "+ row[min].puerto);
              firewall.dnatae("añadirsolo", ip_origen, row[min].ip_vm, row[min].puerto, function(){
                min++;
                bucle();
              });
            }

          }
          else{
            setTimeout(function(){
              res.redirect('/controlpanel');
  	        }, 3000);
          }

        }

        bucle();

      });
  });
});
});
});
});
}
});


app.get('/logout',cas.logout, function(req,res){

  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);

  firewall.tcpkillestablished(ip_origen);

    var user = req.session.user;

    req.session.user = undefined;
    req.session.ip_origen = undefined;
    req.session.destroy();




    serv.broadcastServers('deletednat', ip_origen);
    firewall.deletednat(ip_origen, function(){
      pool.getConnection(function(err, connection) {
        var conexion = connection;
        conexion.query("DELETE FROM Firewall WHERE ip_origen='"+ip_origen+"'",function(error, results, fields) {
          conexion.release();
          setTimeout(function(){
            if(mapUserSocket.get(user) != undefined){
              cli.broadcastClient(user, "reload","");
            }
            res.redirect('/');
          },4000);

        });
      });
    });



})

app.get('/comprobardisponibilidad', function(req,res){
  if(req.session.user != undefined){
    if(req.session.rol == "profesor"){
        pool.getConnection(function(err, connection) {
          var conexion = connection;
          conexion.query("SELECT count(*) AS total FROM Servicios WHERE motivo='"+req.query.nombre+"'",function(error, total, fields) {
              conexion.release();
              var datos = {};
              if(total[0].total == 0){
                  datos = {"valido" : true};
                }else{
                  datos = {"valido" : false};
                }
              res.send(datos);
            });
      });
    }else{
      res.send("no disponible");
    }
  }
  else{
    res.send("no disponible");
  }

})

var quitardominio = new RegExp(/\w*/);

app.post('/nuevoservicio', function(req,res){
  if(req.session.user != undefined){
    if(req.session.rol == "profesor"){
      req.body['nombreservicio'] = functions.getCleanedString(req.body['nombreservicio']);
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query("SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='"+req.body['nombreservicio']+"'",function(error, total, fields) {
            if(total[0].total == 0){
              connection.query("INSERT INTO Servicios (usuario, motivo) VALUES ('"+req.session.user+"','"+req.body['nombreservicio']+"')",function(error, result, fields) {
                var valores = req.body['usuario'];
                if(valores != undefined){
                  if(valores instanceof Array){
                    async.forEach(valores, function(item, callback) {
                      var aux = item.match(quitardominio);
                      connection.query("INSERT INTO Matriculados (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                        connection.query("INSERT INTO Ultima_conexion (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                          if(item == valores[valores.length-1]){
                            connection.query("UNLOCK TABLES",function(error, results, fields) {
                                logger.debug(`liberando tablas MySQL`);
                              connection.release();
                              res.redirect('/controlpanel');
                            });
                          }
                        });
                      });
                    });

                  }
                  else{
                    var aux = valores.match(quitardominio);
                    connection.query("INSERT INTO Matriculados (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                      connection.query("INSERT INTO Ultima_conexion (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                        connection.query("UNLOCK TABLES",function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      });
                    });
                  }
                }
                else{
                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              });
            }
            else{
              connection.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                connection.release();
                res.redirect('/controlpanel');
              });
            }
          });
        });
      });
      }
    }
});




app.post('/eliminarservicio', function(req,res){
  if(req.session.user != undefined){
    if(req.session.rol == "profesor"){
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query("SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+req.session.user+"'",function(error, total, fields) {
            if(total[0].total == 1){
              connection.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+req.body['nombreservicio']+"'",function(error, total, fields) {
                if(total[0].total == 0){
                  connection.query("INSERT INTO Eliminar_servicio (motivo) VALUES ('"+req.body['nombreservicio']+"')",function(error, result, fields) {
                    connection.query("SELECT usuario FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario NOT IN (SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='"+req.body['nombreservicio']+"')",function(error, matriculados, fields) {
                      var max = matriculados.length;
                      var min = 0;

                      var bucle = function(){

                        if(min < max){


                          var aux = matriculados[min].usuario;
                                connection.query("SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                                  if(total[0].total == 0){
                                    connection.query("DELETE FROM Cola WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) { //por si acaso
                                    connection.query("SELECT * FROM Asignaciones as a1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, estaasignado, fields) {
                                      if(estaasignado.length == 0){//si no está encendido

                                                  connection.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                    connection.query("DELETE FROM Matriculados WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                      connection.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                        connection.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                          if(result[0].total == 0){
                                                            functions.eliminardirectoriotodo(req.body['nombreservicio'], function(){
                                                              pool.getConnection(function(err, connection) {
                                                                connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                                  connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                                    connection.query("DELETE FROM Servicios WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                                      connection.query("UNLOCK TABLES",function(error, results, fields) {
                                                                        connection.release();
                                                                      });
                                                                    });
                                                                  });
                                                                });
                                                              });
                                                            });
                                                            min++;
                                                            bucle();
                                                          }
                                                          else{
                                                            min++;
                                                            bucle();
                                                          }
                                                        });
                                                      });
                                                    });
                                                  });



                                      }
                                      else{ // si está encendido mandamos a apagar
                                        if(vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined){
                                          var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                          connection.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+estaasignado[0].ip_vm+"', '"+estaasignado[0].motivo+"','"+aux+"', 'down')",function(error, results2, fields) {
                                            var json = {"user" : aux, "motivo" : estaasignado[0].motivo, "puerto" : estaasignado[0].puerto};
                                            socket_vm.emit("stop", json);
                                              logger.info(`enviado stop`);
                                              min++;
                                              bucle();
                                          });
                                        }
                                        else{
                                          min++;
                                          bucle();
                                        }
                                      }
                                    });
                                  });
                                  }
                                  else{
                                    min++;
                                    bucle();
                                  }
                                });

                        }
                        else{
                          connection.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                            if(result[0].total == 0){
                              connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                connection.query("DELETE FROM Servicios WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                                    connection.release();
                                    res.redirect('/controlpanel');
                                  });
                                });
                              });
                            }
                            else{
                              connection.query("UNLOCK TABLES",function(error, results, fields) {
                                connection.release();
                                res.redirect('/controlpanel');
                              });
                            }
                          });

                        }

                      }

                      bucle();

                    });
                  });
                }
                else{
                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              });
            }
            else{
              connection.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                connection.release();
                res.redirect('/controlpanel');
              });
            }
          });
        });
      });
    }
  }
});




app.post('/aniadirusuarios', function(req,res){
  if(req.session.user != undefined){
    if(req.session.rol == "profesor"){
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query("SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+req.session.user+"'",function(error, total, fields) {
            if(total[0].total == 1){
              connection.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                if(result[0].total == 0){
                var valores = req.body['usuario'];
                if(valores != undefined){
                  if(valores instanceof Array){
                    async.forEach(valores, function(item, callback) {
                      var aux = item.match(quitardominio);
                      connection.query("SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                        if(total[0].total == 0){
                          connection.query("INSERT INTO Matriculados (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                            connection.query("INSERT INTO Ultima_conexion (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                                connection.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                if(item == valores[valores.length-1]){
                                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                                      logger.debug(`liberando tablas MySQL`);
                                    connection.release();
                                    res.redirect('/controlpanel');
                                  });
                                }
                              });
                            });
                          });
                        }
                        else{
                          if(item == valores[valores.length-1]){
                            connection.query("UNLOCK TABLES",function(error, results, fields) {
                                logger.debug(`liberando tablas MySQL`);
                              connection.release();
                              res.redirect('/controlpanel');
                            });
                          }
                        }
                      });
                    });

                  }
                  else{
                    var aux = valores.match(quitardominio);
                    connection.query("SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                      if(total[0].total == 0){
                        connection.query("INSERT INTO Matriculados (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                          connection.query("INSERT INTO Ultima_conexion (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                            connection.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                              connection.query("UNLOCK TABLES",function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                connection.release();
                                res.redirect('/controlpanel');
                              });
                            });
                          });
                        });
                      }
                      else{
                        connection.query("UNLOCK TABLES",function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      }
                    });
                  }
                }
                else{
                  logger.info(`ERROR -> No se han enviado usuarios`);
                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                connection.query("UNLOCK TABLES",function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  connection.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              connection.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                connection.release();
                res.redirect('/controlpanel');
              });
            }
          });
        });
      });
      }
    }
});


app.post('/eliminarusuarios', function(req,res){
  if(req.session.user != undefined){
    if(req.session.rol == "profesor"){
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query("SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+req.session.user+"'",function(error, total, fields) {
            if(total[0].total == 1){
              connection.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                if(result[0].total == 0){
                var valores = req.body['usuario'];
                if(valores != undefined){
                  if(valores instanceof Array){
                    var max = valores.length;
                    var min = 0;

                    var bucle = function(){
                      if(min < max){


                        var aux = valores[min];
                        connection.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                          if(total[0].total == 1){
                            connection.query("SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                              if(total[0].total == 0){
                            connection.query("INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                              connection.query("SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                                if(total[0].total == 0){
                                  connection.query("DELETE FROM Cola WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) { //por si acaso
                                  connection.query("SELECT * FROM Asignaciones as a1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, estaasignado, fields) {
                                    if(estaasignado.length == 0){//si no está encendido
                                      functions.eliminardirectoriosolo(aux, req.body['nombreservicio'], function(){
                                        pool.getConnection(function(err, conexion) {
                                          conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                            conexion.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                              if(result[0].total == 0){
                                                conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                  conexion.query("DELETE FROM Matriculados WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                    conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    });
                                                  });
                                                });
                                              }
                                              else{
                                                conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                  conexion.query("DELETE FROM Matriculados WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                    conexion.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                      conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                        if(result[0].total == 0){
                                                          functions.eliminardirectoriotodo(req.body['nombreservicio'], function(){
                                                            pool.getConnection(function(err, connection) {
                                                              connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                                connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                                  connection.query("DELETE FROM Servicios WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                                    connection.query("UNLOCK TABLES",function(error, results, fields) {
                                                                      connection.release();
                                                                    });
                                                                  });
                                                                });
                                                              });
                                                            });
                                                          });
                                                          conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                            conexion.release();
                                                          });
                                                        }
                                                        else{
                                                          conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                            conexion.release();
                                                          });
                                                        }
                                                      });
                                                    });
                                                  });
                                                });
                                              }
                                          });
                                        });
                                      });
                                    });

                                    min++;
                                    bucle();

                                    }
                                    else{ // si está encendido mandamos a apagar
                                      if(vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined){
                                        var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                        connection.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+estaasignado[0].ip_vm+"', '"+estaasignado[0].motivo+"','"+aux+"', 'down')",function(error, results2, fields) {
                                          var json = {"user" : aux, "motivo" : estaasignado[0].motivo, "puerto" : estaasignado[0].puerto};
                                          socket_vm.emit("stop", json);
                                            logger.info(`enviado stop`);
                                            min++;
                                            bucle();
                                        });
                                      }
                                      else{
                                        min++;
                                        bucle();
                                      }
                                    }
                                  });
                                });
                                }
                                else{
                                  min++;
                                  bucle();
                                }
                              });
                            });
                          }
                          else{
                            min++;
                            bucle();
                          }
                          });
                          }
                        else{
                          min++;
                          bucle();
                        }
                      });




                      }
                      else{
                        connection.query("UNLOCK TABLES",function(error, results, fields) {
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      }
                    }

                    bucle();


                  }
                  else{
                    var aux = valores;
                    connection.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                      if(total[0].total == 1){
                        connection.query("SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                          if(total[0].total == 0){
                        connection.query("INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '"+aux+"','"+req.body['nombreservicio']+"' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"')",function(error, result, fields) {
                          connection.query("SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, total, fields) {
                            if(total[0].total == 0){
                              connection.query("DELETE FROM Cola WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) { //por si acaso
                              connection.query("SELECT * FROM Asignaciones as a1 WHERE motivo='"+req.body['nombreservicio']+"' AND usuario='"+aux+"'",function(error, estaasignado, fields) {
                                if(estaasignado.length == 0){//si no está encendido
                                  functions.eliminardirectoriosolo(aux, req.body['nombreservicio'], function(){
                                    pool.getConnection(function(err, conexion) {
                                      conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                        conexion.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                          if(result[0].total == 0){
                                            conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                              conexion.query("DELETE FROM Matriculados WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                  conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                    conexion.release();
                                                  });
                                                });
                                              });
                                            });
                                          }
                                          else{
                                            conexion.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                              conexion.query("DELETE FROM Matriculados WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                conexion.query("DELETE FROM Ultima_conexion WHERE usuario='"+aux+"' AND motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                  conexion.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                    if(result[0].total == 0){
                                                      functions.eliminardirectoriotodo(req.body['nombreservicio'], function(){
                                                        pool.getConnection(function(err, connection) {
                                                          connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                            connection.query("DELETE FROM Eliminar_servicio WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                              connection.query("DELETE FROM Servicios WHERE motivo='"+req.body['nombreservicio']+"'",function(error, result, fields) {
                                                                connection.query("UNLOCK TABLES",function(error, results, fields) {
                                                                  connection.release();
                                                                });
                                                              });
                                                            });
                                                          });
                                                        });
                                                      });
                                                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    }
                                                    else{
                                                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    }
                                                  });
                                                });
                                              });
                                            });
                                          }
                                      });
                                    });
                                  });
                                });
                                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                                    connection.release();
                                    res.redirect('/controlpanel');
                                  });
                                }
                                else{ // si está encendido mandamos a apagar
                                  if(vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined){
                                    var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                    connection.query("INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('"+estaasignado[0].ip_vm+"', '"+estaasignado[0].motivo+"','"+aux+"', 'down')",function(error, results2, fields) {
                                      var json = {"user" : aux, "motivo" : estaasignado[0].motivo, "puerto" : estaasignado[0].puerto};
                                      socket_vm.emit("stop", json);
                                        logger.info(`enviado stop`);
                                        connection.query("UNLOCK TABLES",function(error, results, fields) {
                                          connection.release();
                                          res.redirect('/controlpanel');
                                        });
                                    });
                                  }
                                  else{
                                    connection.query("UNLOCK TABLES",function(error, results, fields) {
                                        logger.debug(`liberando tablas MySQL`);
                                      connection.release();
                                      res.redirect('/controlpanel');
                                    });
                                  }
                                }
                              });
                            });
                            }
                            else{
                              connection.query("UNLOCK TABLES",function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                connection.release();
                                res.redirect('/controlpanel');
                              });
                            }
                          });
                        });
                      }
                      else{
                        connection.query("UNLOCK TABLES",function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      }
                      });
                      }
                    else{
                      connection.query("UNLOCK TABLES",function(error, results, fields) {
                          logger.debug(`liberando tablas MySQL`);
                        connection.release();
                        res.redirect('/controlpanel');
                      });
                    }
                  });
                  }
                }
                else{
                  logger.info(`ERROR -> No se han enviado usuarios`);
                  connection.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                connection.query("UNLOCK TABLES",function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  connection.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              connection.query("UNLOCK TABLES",function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                connection.release();
                res.redirect('/controlpanel');
              });
            }
          });
        });
      });
      }
    }
});


app.get('*', function(req, res){
  res.render('error', {});
});



app.listen(config.puerto_server, function(){
  logger.info(`Servidor web escuchando en el puerto "${config.puerto_server}"`);
});

//////////////////////////////////////////
