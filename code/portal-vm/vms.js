const sio = require('socket.io');

const config = require('./config.json');

const wsVMs = sio(config.puerto_wsVMs, {
  pingTimeout: 3000,
  pingInterval: 3000,
});


const mapIpVMS = new Map();

function getSocketFromIP(ip) {
  return mapIpVMS.get(ip)[mapIpVMS.get(ip).length - 1];
}


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
                                             ovirt.ajustaVMArrancadas();
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
                                             ovirt.ajustaVMArrancadas();
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

                                   //ovirt.ajustaVMArrancadas();
                                 });

                                 }

                                 });
                                 });
                                 });
                               }

                               else{
                                 conexion.query("UNLOCK TABLES",function(error, results, fields) {
                                 conexion.release();
                                 ovirt.ajustaVMArrancadas();

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
                       ovirt.ajustaVMArrancadas();
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
                            ovirt.ajustaVMArrancadas();
                          });
                          }
                          else{
                            conexion.query("UNLOCK TABLES",function(error, results, fields) {
                              logger.debug(`liberando tablas MySQL`);
                            conexion.release();

                            vmfree();
                            ovirt.ajustaVMArrancadas();
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
                    ovirt.ajustaVMArrancadas();
                  });


                    }
                    else{
                      conexion.query("UNLOCK TABLES",function(error, results, fields) {
                        logger.debug(`liberando tablas MySQL`);
                      conexion.release();

                      vmfree();
                      ovirt.ajustaVMArrancadas();
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


module.exports = {
  mapIpVMS,
  getSocketFromIP,
};
