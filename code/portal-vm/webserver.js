const express = require('express');
const bodyParser = require('body-parser');

const logger = require('./logger.js').child({ label: 'websrv' });

logger.info('Comienza modulo webserver.js');

const functions = require('./functions.js');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/cloud', express.static('./client/views'));
app.use('/', express.static('./client/views'));

app.set('views', './client/views'); // Configuramos el directorio de vistas
app.set('view engine', 'ejs');

/// RUTAS WEB ////////////////////////////


app.get('/', function(req,res) {
  const ip_origen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user === undefined) {
    serv.broadcastServers('deletednat', ip_origen);
    firewall.deletednat(ip_origen, function() {
      pool.getConnection(function(err, connection) {
      var conexion = connection;
      conexion.query(`DELETE FROM Firewall WHERE ip_origen='${functions.cleanAddress(req.connection.remoteAddress)}'`,function(error, results, fields) {
        conexion.release();
        res.render('index', {});
      });
    });
  });
  }
  else{
    if (ip_origen != req.session.ip_origen) { //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
    res.redirect('/controlpanel');
  }
  }

});



app.get('/controlpanel', function(req,res) {
  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);
if (req.session.user != undefined) {
  if (ip_origen != req.session.ip_origen) { //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
    res.redirect('/logout');
  }
  else{
  logger.info(`Es usuario `${req.session.user}``);
  if (req.session.rol == `profesor`) {
    pool.getConnection(function(err, connection) {
    var conexion = connection;
    conexion.query(`SELECT * FROM Matriculados NATURAL JOIN Asignaciones WHERE usuario='${req.session.user}' AND motivo NOT IN ( SELECT motivo FROM Pendientes WHERE tipo='down' AND usuario='${req.session.user}')`,function(error, upped, fields) {
      conexion.query(`SELECT * FROM Matriculados NATURAL JOIN Asignaciones NATURAL JOIN Pendientes WHERE usuario='${req.session.user}'`,function(error, dowing, fields) {
        conexion.query(`SELECT usuario, motivo FROM Matriculados NATURAL JOIN Pendientes WHERE usuario='${req.session.user}' AND tipo='up' UNION ALL SELECT usuario, motivo FROM Matriculados NATURAL JOIN Cola WHERE usuario='${req.session.user}'`,function(error, upping, fields) {
          conexion.query(`SELECT * FROM Matriculados WHERE usuario='${req.session.user}' AND motivo NOT IN (SELECT motivo FROM Pendientes WHERE usuario='${req.session.user}' UNION SELECT motivo FROM Asignaciones WHERE usuario='${req.session.user}' UNION SELECT motivo FROM Cola WHERE usuario='${req.session.user}')`,function(error, rest, fields) {
            conexion.query(`SELECT motivo FROM Servicios WHERE usuario='${req.session.user}' AND motivo NOT IN (SELECT motivo FROM Eliminar_servicio)`,function(error, motivos, fields) {
              var tservicios = [];
              var max = motivos.length;
              var min = 0;

              var bucle = function() {
                if (min < max) {
                  conexion.query(`SELECT * FROM Matriculados NATURAL JOIN Ultima_conexion WHERE motivo='${motivos[min].motivo}' AND usuario NOT IN ( SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='${motivos[min].motivo}')`,function(error, result, fields) {
                    conexion.query(`SELECT usuario FROM Asignaciones WHERE motivo='${motivos[min].motivo}'`,function(error, result2, fields) {
                      var set = new Set();
                      var usuarios = [];
                      for (var j=0; j<result2.length; j++) {
                        set.add(result2[j].usuario);
                      }
                      for (var i=0; i<result.length; i++) {
                        if (set.has(result[i].usuario)) {
                          var a = {`usuario`:result[i].usuario, `estado`:`up`, `fecha` : result[i].fecha}
                          usuarios.push(a);
                        }
                        else{
                          var a = {`usuario`:result[i].usuario, `estado`:`down`, `fecha` : result[i].fecha}
                          usuarios.push(a);
                        }
                      }
                      var aux = {`motivo` : motivos[min].motivo, `usuarios` : usuarios};
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
    conexion.query(`SELECT * FROM Matriculados NATURAL JOIN Asignaciones WHERE usuario='${req.session.user}' AND motivo NOT IN ( SELECT motivo FROM Pendientes WHERE tipo='down' AND usuario='${req.session.user}')`,function(error, upped, fields) {
      conexion.query(`SELECT * FROM Matriculados NATURAL JOIN Asignaciones NATURAL JOIN Pendientes WHERE usuario='${req.session.user}'`,function(error, dowing, fields) {
        conexion.query(`SELECT usuario, motivo FROM Matriculados NATURAL JOIN Pendientes WHERE usuario='${req.session.user}' AND tipo='up' UNION ALL SELECT usuario, motivo FROM Matriculados NATURAL JOIN Cola WHERE usuario='${req.session.user}'`,function(error, upping, fields) {
          conexion.query(`SELECT * FROM Matriculados WHERE usuario='${req.session.user}' AND motivo NOT IN (SELECT motivo FROM Pendientes WHERE usuario='${req.session.user}' UNION SELECT motivo FROM Asignaciones WHERE usuario='${req.session.user}' UNION SELECT motivo FROM Cola WHERE usuario='${req.session.user}')`,function(error, rest, fields) {
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

app.get('/cloud/:motivo', function(req,res) {
  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user != undefined) {
    if (ip_origen != req.session.ip_origen) { //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
    pool.getConnection(function(err, connection) {
      var conexion = connection;
      conexion.query(`SELECT * FROM Asignaciones WHERE usuario='${req.session.user}' AND motivo='${req.params.motivo}'`, function(err, row) {
        if (err) throw err;
        conexion.release();
        if (row.length != 0) {
          conexion.query(`UPDATE Ultima_conexion SET fecha='${functions.dateFormat()}' WHERE usuario='${req.session.user}' AND motivo='${req.params.motivo}'`,function(error, result, fields) {
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

app.get('/autenticacion', cas.bounce, function(req,res) {
var ip_origen = functions.cleanAddress(req.connection.remoteAddress);

  if (req.session.user != undefined) {
    if (ip_origen != req.session.ip_origen) { //si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
      res.redirect('/logout');
    }
    else{
      res.redirect('/');
    }
  }
    else{

//borrar iptables de esta ip por si acaso
      serv.broadcastServers('deletednat', ip_origen);
      firewall.deletednat(ip_origen, function() {
      pool.getConnection(function(err, connection) {
        var conexion = connection;
        conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ip_origen}'`,function(error, results, fields) {


          req.session.user = req.session[`cas_userinfo`].username;

  //req.session.user = req.session[`cas_userinfo`].username;
  req.session.ip_origen = ip_origen;
  getRoll(req.session.user)
  .then((rol) => {
    logger.info(`Usuario considerado `${rol}``);
    req.session.rol = rol;
  })
  .then(() => {
    conexion.query(`INSERT INTO Firewall (usuario, ip_origen) VALUES ('${req.session.user}','${ip_origen}')`,function(error, results, fields) {

      //Actualizamos iptables
      conexion.query(`SELECT ip_vm, puerto FROM Asignaciones WHERE usuario='${req.session.user}'`, function(err,row) {

        conexion.release();

        if (err) logger.info(err);

        var min = 0;
        var max = row.length;

        var bucle = function() {
          if (min < max) {
            if (min == 0) {
              serv.broadcastServers(`añadircomienzo`, ip_origen } ${ row[min].ip_vm } ${ row[min].puerto)
              firewall.dnatae(`añadircomienzo`, ip_origen, row[min].ip_vm, 0, function() {
                serv.broadcastServers(`añadirsolo`, ip_origen } ${ row[min].ip_vm } ${ row[min].puerto);
                firewall.dnatae(`añadirsolo`, ip_origen, row[min].ip_vm, row[min].puerto, function() {
                  min++;
                  bucle();
                });
              });
            }
            else{
              serv.broadcastServers(`añadirsolo`, ip_origen } ${ row[min].ip_vm } ${ row[min].puerto);
              firewall.dnatae(`añadirsolo`, ip_origen, row[min].ip_vm, row[min].puerto, function() {
                min++;
                bucle();
              });
            }

          }
          else{
            setTimeout(function() {
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


app.get('/logout',cas.logout, function(req,res) {

  var ip_origen = functions.cleanAddress(req.connection.remoteAddress);

  firewall.tcpkillestablished(ip_origen);

    var user = req.session.user;

    req.session.user = undefined;
    req.session.ip_origen = undefined;
    req.session.destroy();




    serv.broadcastServers('deletednat', ip_origen);
    firewall.deletednat(ip_origen, function() {
      pool.getConnection(function(err, connection) {
        var conexion = connection;
        conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ip_origen}'`,function(error, results, fields) {
          conexion.release();
          setTimeout(function() {
            if (mapUserSocket.get(user) != undefined) {
              cli.broadcastClient(user, `reload`,``);
            }
            res.redirect('/');
          },4000);

        });
      });
    });



})

app.get('/comprobardisponibilidad', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
        pool.getConnection(function(err, connection) {
          var conexion = connection;
          conexion.query(`SELECT count(*) AS total FROM Servicios WHERE motivo='${req.query.nombre}'`,function(error, total, fields) {
              conexion.release();
              var datos = {};
              if (total[0].total == 0) {
                  datos = {`valido` : true};
                }else{
                  datos = {`valido` : false};
                }
              res.send(datos);
            });
      });
    }else{
      res.send(`no disponible`);
    }
  }
  else{
    res.send(`no disponible`);
  }

})

var quitardominio = new RegExp(/\w*/);

app.post('/nuevoservicio', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
      req.body['nombreservicio'] = functions.getCleanedString(req.body['nombreservicio']);
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${req.body['nombreservicio']}'`,function(error, total, fields) {
            if (total[0].total == 0) {
              connection.query(`INSERT INTO Servicios (usuario, motivo) VALUES ('${req.session.user}','${req.body['nombreservicio']}')`,function(error, result, fields) {
                var valores = req.body['usuario'];
                if (valores != undefined) {
                  if (valores instanceof Array) {
                    async.forEach(valores, function(item, callback) {
                      var aux = item.match(quitardominio);
                      connection.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                        connection.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                          if (item == valores[valores.length-1]) {
                            connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                    connection.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                      connection.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                        connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      });
                    });
                  }
                }
                else{
                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              });
            }
            else{
              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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




app.post('/eliminarservicio', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${req.session.user}'`,function(error, total, fields) {
            if (total[0].total == 1) {
              connection.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${req.body['nombreservicio']}'`,function(error, total, fields) {
                if (total[0].total == 0) {
                  connection.query(`INSERT INTO Eliminar_servicio (motivo) VALUES ('${req.body['nombreservicio']}')`,function(error, result, fields) {
                    connection.query(`SELECT usuario FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}' AND usuario NOT IN (SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='${req.body['nombreservicio']}')`,function(error, matriculados, fields) {
                      var max = matriculados.length;
                      var min = 0;

                      var bucle = function() {

                        if (min < max) {


                          var aux = matriculados[min].usuario;
                                connection.query(`SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                                  if (total[0].total == 0) {
                                    connection.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) { //por si acaso
                                    connection.query(`SELECT * FROM Asignaciones as a1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, estaasignado, fields) {
                                      if (estaasignado.length == 0) {//si no está encendido

                                                  connection.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                    connection.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                      connection.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                        connection.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                          if (result[0].total == 0) {
                                                            functions.eliminardirectoriotodo(req.body['nombreservicio'], function() {
                                                              pool.getConnection(function(err, connection) {
                                                                connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                                  connection.query(`DELETE FROM Eliminar_servicio WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                                    connection.query(`DELETE FROM Servicios WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                                      connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                                        if (vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined) {
                                          var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                          connection.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${estaasignado[0].ip_vm}', '${estaasignado[0].motivo}','${aux}', 'down')`,function(error, results2, fields) {
                                            var json = {`user` : aux, `motivo` : estaasignado[0].motivo, `puerto` : estaasignado[0].puerto};
                                            socket_vm.emit(`stop`, json);
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
                          connection.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                            if (result[0].total == 0) {
                              connection.query(`DELETE FROM Eliminar_servicio WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                connection.query(`DELETE FROM Servicios WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                    connection.release();
                                    res.redirect('/controlpanel');
                                  });
                                });
                              });
                            }
                            else{
                              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              });
            }
            else{
              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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




app.post('/aniadirusuarios', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${req.session.user}'`,function(error, total, fields) {
            if (total[0].total == 1) {
              connection.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                if (result[0].total == 0) {
                var valores = req.body['usuario'];
                if (valores != undefined) {
                  if (valores instanceof Array) {
                    async.forEach(valores, function(item, callback) {
                      var aux = item.match(quitardominio);
                      connection.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                        if (total[0].total == 0) {
                          connection.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                            connection.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                                connection.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                if (item == valores[valores.length-1]) {
                                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                          if (item == valores[valores.length-1]) {
                            connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                    connection.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                      if (total[0].total == 0) {
                        connection.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                          connection.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                            connection.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                connection.release();
                                res.redirect('/controlpanel');
                              });
                            });
                          });
                        });
                      }
                      else{
                        connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  connection.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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


app.post('/eliminarusuarios', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
      pool.getConnection(function(err, connection) {
        connection.query(db.bloqueoTablas,function(error, results, fields) {
          connection.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${req.session.user}'`,function(error, total, fields) {
            if (total[0].total == 1) {
              connection.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                if (result[0].total == 0) {
                var valores = req.body['usuario'];
                if (valores != undefined) {
                  if (valores instanceof Array) {
                    var max = valores.length;
                    var min = 0;

                    var bucle = function() {
                      if (min < max) {


                        var aux = valores[min];
                        connection.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                          if (total[0].total == 1) {
                            connection.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                              if (total[0].total == 0) {
                            connection.query(`INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                              connection.query(`SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                                if (total[0].total == 0) {
                                  connection.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) { //por si acaso
                                  connection.query(`SELECT * FROM Asignaciones as a1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, estaasignado, fields) {
                                    if (estaasignado.length == 0) {//si no está encendido
                                      functions.eliminardirectoriosolo(aux, req.body['nombreservicio'], function() {
                                        pool.getConnection(function(err, conexion) {
                                          conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                            conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                              if (result[0].total == 0) {
                                                conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                  conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                    conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                      conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    });
                                                  });
                                                });
                                              }
                                              else{
                                                conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                  conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                    conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                      conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                        if (result[0].total == 0) {
                                                          functions.eliminardirectoriotodo(req.body['nombreservicio'], function() {
                                                            pool.getConnection(function(err, connection) {
                                                              connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                                connection.query(`DELETE FROM Eliminar_servicio WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                                  connection.query(`DELETE FROM Servicios WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                                    connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                                      connection.release();
                                                                    });
                                                                  });
                                                                });
                                                              });
                                                            });
                                                          });
                                                          conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                            conexion.release();
                                                          });
                                                        }
                                                        else{
                                                          conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                                      if (vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined) {
                                        var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                        connection.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${estaasignado[0].ip_vm}', '${estaasignado[0].motivo}','${aux}', 'down')`,function(error, results2, fields) {
                                          var json = {`user` : aux, `motivo` : estaasignado[0].motivo, `puerto` : estaasignado[0].puerto};
                                          socket_vm.emit(`stop`, json);
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
                        connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      }
                    }

                    bucle();


                  }
                  else{
                    var aux = valores;
                    connection.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                      if (total[0].total == 1) {
                        connection.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                          if (total[0].total == 0) {
                        connection.query(`INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '${aux}','${req.body['nombreservicio']}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}')`,function(error, result, fields) {
                          connection.query(`SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, total, fields) {
                            if (total[0].total == 0) {
                              connection.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) { //por si acaso
                              connection.query(`SELECT * FROM Asignaciones as a1 WHERE motivo='${req.body['nombreservicio']}' AND usuario='${aux}'`,function(error, estaasignado, fields) {
                                if (estaasignado.length == 0) {//si no está encendido
                                  functions.eliminardirectoriosolo(aux, req.body['nombreservicio'], function() {
                                    pool.getConnection(function(err, conexion) {
                                      conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                        conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                          if (result[0].total == 0) {
                                            conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                              conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                    conexion.release();
                                                  });
                                                });
                                              });
                                            });
                                          }
                                          else{
                                            conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                              conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                  conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                    if (result[0].total == 0) {
                                                      functions.eliminardirectoriotodo(req.body['nombreservicio'], function() {
                                                        pool.getConnection(function(err, connection) {
                                                          connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                            connection.query(`DELETE FROM Eliminar_servicio WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                              connection.query(`DELETE FROM Servicios WHERE motivo='${req.body['nombreservicio']}'`,function(error, result, fields) {
                                                                connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                                  connection.release();
                                                                });
                                                              });
                                                            });
                                                          });
                                                        });
                                                      });
                                                      conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    }
                                                    else{
                                                      conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                    connection.release();
                                    res.redirect('/controlpanel');
                                  });
                                }
                                else{ // si está encendido mandamos a apagar
                                  if (vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined) {
                                    var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                    connection.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${estaasignado[0].ip_vm}', '${estaasignado[0].motivo}','${aux}', 'down')`,function(error, results2, fields) {
                                      var json = {`user` : aux, `motivo` : estaasignado[0].motivo, `puerto` : estaasignado[0].puerto};
                                      socket_vm.emit(`stop`, json);
                                        logger.info(`enviado stop`);
                                        connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                          connection.release();
                                          res.redirect('/controlpanel');
                                        });
                                    });
                                  }
                                  else{
                                    connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                connection.release();
                                res.redirect('/controlpanel');
                              });
                            }
                          });
                        });
                      }
                      else{
                        connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          connection.release();
                          res.redirect('/controlpanel');
                        });
                      }
                      });
                      }
                    else{
                      connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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
                  connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    connection.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                connection.query(`UNLOCK TABLES`,function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  connection.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              connection.query(`UNLOCK TABLES`,function(error, results, fields) {
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


app.get('*', function(req, res) {
  res.render('error', {});
});



app.listen(config.puerto_server, function() {
  logger.info(`Servidor web escuchando en el puerto `${config.puerto_server}``);
});

//////////////////////////////////////////
