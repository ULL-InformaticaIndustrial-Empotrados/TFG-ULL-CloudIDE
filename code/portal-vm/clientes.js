const sio = require('socket.io');

const logger = require('./logger.js').child({ label: 'clientes' });

logger.info('Comienza modulo clientes.js');

const config = require('./config.json');
const db = require('./database.js');
const functions = require('./functions.js');
const vms = require('./vms.js');

const mapUserSocket = new Map();

const wsClient = sio.listen(config.puerto_wsClients);


function broadcastClient(user, evento, data) {
  const socks = mapUserSocket.get(user);
  if (socks !== undefined) {
    socks.forEach((value) => {
      value.emit(evento, data);
    });
  }
}

class Condicion {
  constructor(msg) {
    this.msg = msg;
  }
}

wsClient.on('connection', (socket) => {
  const usuario = socket.session.user;
  logger.info(`Conexión cliente de "${socket.id}" Con ip "${socket.handshake.address}" para usuario '${usuario}'`);

  if (usuario) {
    if (mapUserSocket.get(usuario) === undefined) {
      mapUserSocket.set(usuario, new Map());
    }
    const mapUsu = mapUserSocket.get(usuario);
    mapUsu.set(socket.id, socket);
    logger.info(`tiene conectados a la vez "${mapUsu.size}"`);
  }

  socket.on('disconnect', () => {
    logger.info(`client disconnected: ${usuario}`);
    if (usuario) {
      if (mapUserSocket.get(usuario) !== undefined) {
        const mapUsu = mapUserSocket.get(usuario);
        mapUsu.delete(socket.id);
        logger.info(`tiene conectados a la vez "${mapUsu.size}"`);
        if (mapUsu.size === 0) {
          logger.info(`no hay mas conexiones del usuario "${usuario}"`);
          mapUserSocket.delete(usuario);
        }
      }
    }
  });

  socket.on('stopenlace', async (motivo) => {
    if (!usuario) {
      logger.warn('En stopenlace pero no hay usuario definido');
      return;
    }
    logger.info(`stopenlace '${usuario}'- '${motivo}'`);
    // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
    if (functions.cleanAddress(socket.handshake.address) !== socket.session.ip_origen) {
      const msg = 'Está accediendo desde una ip diferente a la inicial';
      if (mapUserSocket.get(usuario) !== undefined) {
        socket.emit('data-error', { msg });
      }
      logger.warn(msg);
      return;
    }

    try {
      const pool = await db.pool;
      const conexion = await pool.getConnection();
      await conexion.query(db.bloqueoTablas);

      const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Matriculados AS m1
        WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
      if (existeMatriculados <= 0) {
        throw new Condicion('No está matriculado de este servidor');
      }

      const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
        FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
        WHERE usuario='${usuario}' AND motivo='${motivo}'
        UNION SELECT motivo FROM Eliminar_servicio as es
        WHERE motivo='${motivo}') AS alias`))[0].total;
      if (eliminando > 0) {
        throw new Condicion('No se puede parar, se está eliminando servicio (individual o global)');
      }

      const numPendientes = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Pendientes AS p1 WHERE motivo='${motivo}'
        AND usuario='${usuario}'`))[0].total;
      if (numPendientes > 0) {
        throw new Condicion('No se puede parar, hay solicitud pendiente');
      }

      const results = await conexion.query(`SELECT * FROM Asignaciones AS a1
        WHERE motivo='${motivo}' AND usuario='${usuario}'`);
      if (results.length <= 0) {
        throw new Condicion('No hay asignación para este usuario y servicio');
      }
      const ipVM = results[0].ip_vm;
      if (vms.mapIpVMS.get(ipVM) === undefined) {
        throw new Condicion('No hay conexión con el servidor de la asignación');
      }
      const socketVM = vms.getSocketFromIP(ipVM);
      await conexion.query(`INSERT INTO Pendientes
        (ip_vm, motivo, usuario, tipo) VALUES
        ('${ipVM}', '${motivo}','${usuario}', 'down')`);
      const json = { user: usuario, motivo, puerto: results[0].puerto };
      socketVM.emit('stop', json);

      logger.info(`enviado stop a ${ipVM} para ${usuario}-${motivo}`);
    } catch (err) {
      if (err instanceof Condicion) {
        if (mapUserSocket.get(usuario) !== undefined) {
          socket.emit('data-error', { msg: err.msg });
        }
        logger.info(err.msg);
      } else {
        logger.warn(`Error en 'stopenlace' '${usuario}'- '${motivo}': ${err}`);
      }
    }
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  });

  socket.on('obtenerenlace', async (motivo) => {
    if (!usuario) {
      logger.warn('En obtenerenlace pero no hay usuario definido');
      if (mapUserSocket.get(usuario) != undefined) {
        socket.emit('data-error', { msg: 'Accesso sin iniciar sesión'} );
      }
      return;
    }
    logger.info(`obtenerenlace '${usuario}'- '${motivo}'`);
    // si la ip con la que se logueo es diferente a la que tiene ahora mismo la sesion
    if (functions.cleanAddress(socket.handshake.address) !== socket.session.ip_origen) {
      const msg = 'Está accediendo desde una ip diferente a la inicial';
      if (mapUserSocket.get(usuario) !== undefined) {
        socket.emit('data-error', { msg });
      }
      logger.warn(msg);
      return;
    }
    try {
      const pool = await db.pool;
      const conexion = await pool.getConnection();
      await conexion.query(db.bloqueoTablas);

      const existeMatriculados = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Matriculados AS m1
        WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
      if (existeMatriculados <= 0) {
        throw new Condicion('No está matriculado de este servidor');
      }

      const eliminando = (await conexion.query(`SELECT COUNT(*) AS total
        FROM (SELECT motivo FROM Eliminar_servicio_usuario as esu
        WHERE usuario='${usuario}' AND motivo='${motivo}'
        UNION SELECT motivo FROM Eliminar_servicio as es
        WHERE motivo='${motivo}') AS alias`))[0].total;
      if (eliminando > 0) {
        throw new Condicion('No se puede parar, se está eliminando servicio (individual o global)');
      }

      const motivototal = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Asignaciones AS a1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
      if (motivototal > 0) {
        throw new Condicion('Servicio ya asignado');
      }
      const pendientes1 = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Pendientes AS p1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
      if (pendientes1 > 0) {
        throw new Condicion('Servicio ya pendiente');
      }
      logger.info('no esta en pendientes ni en asignaciones');
      const cola_user = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Cola AS c1 WHERE usuario='${usuario}' AND motivo='${motivo}'`))[0].total;
      if (cola_user > 0) {
        throw new Condicion('El servicio ya está en cola');
      }
      const asignasUser = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Asignaciones AS a1 WHERE usuario='${usuario}'`))[0].total;
      const colasUser = (await conexion.query(`SELECT COUNT(*) AS total
          FROM Cola AS c1 WHERE usuario='${usuario}'`))[0].total;
      const pendientesUserUp = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Pendientes AS p1 WHERE usuario='${usuario}' AND tipo='up'`))[0].total;

      if ((asignasUser + colasUser + pendientesUserUp) >= config.numero_max_serverxuser) {
        throw new Condicion('Supera el número máximo de servidores');
      }
      logger.info(`se inserta en la cola ${user}-${motivo}`);
      await conexion.query(`INSERT INTO Cola (motivo, usuario)
        VALUES ('${motivo}','${usuario}')`);

      const pendientesUser = (await conexion.query(`SELECT COUNT(*) AS total
        FROM Pendientes AS p1 WHERE usuario='${usuario}'`))[0].total;
      if ((asignasUser + pendientesUser) > 0) {
        const pip = (await conexion.query(`SELECT ip_vm FROM Pendientes AS p1
            WHERE usuario='${usuario}'`));
        let ip = 0;
        if (pip.length > 0) ip = pip[0].ip_vm;
        else {
          ip = (await conexion.query(`SELECT ip_vm FROM Asignaciones AS a1
            WHERE usuario='${usuario}'`))[0].ip_vm;
        }

        if (mapIpVMS.get(ip) == undefined) { //si la vm no esta disponible
          await conexion.query(`DELETE FROM Cola WHERE usuario='${usuario}'`);
          throw new Condicion('No se puede obtener el servidor');
        } else {
          let socket_vm = getSocketFromIP(ip);
          const colaUserMotivos = (await conexion.query(`SELECT motivo
            FROM Cola AS c1 WHERE usuario='${usuario}'`));
          await Promise.all(colaUserMotivos.map(async (item) => {
            const json = { user: usuario, motivo: item.motivo };
            socket_vm.emit('load', json);
            logger.info(`enviado ${usuario}-${motivo} a maquina ${ip}`);
            await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
              VALUES ('${ip}', '${item.motivo}','${usuario}', 'up')`);
          }));
          await conexion.query(`DELETE FROM Cola WHERE usuario='${usuario}'`);
        }
      } else {
        logger.info(`todavia ${usuario} no tiene nada asignado`);
  // ESLINT


        conexion.query(`SELECT COUNT(*) AS total FROM Cola AS c1`,function(error, cola_, fields) {
          conexion.query(`SELECT COUNT(*) AS total FROM VMS AS v1`,function(error, vms_, fields) {

                if ((vms_[0].total != 0)&&(cola_[0].total != 0)) {
                  var promise2 = new Promise(function(resolve, reject) {
                  logger.info(`hay maquinas libres y algo en la cola`);
                    conexion.query(`SELECT * FROM VMS AS v1 ORDER BY prioridad ASC LIMIT 1`,function(error, cola_vm, fields) {
                      conexion.query(`SELECT * FROM Cola AS c1 LIMIT 1`,function(error, cola_user, fields) {

                        conexion.query(`SELECT * FROM Cola AS c1 WHERE usuario='${cola_user[0].usuario}'`,function(error, cola_user1, fields) {
                          if (mapIpVMS.get(cola_vm[0].ip_vm) != undefined) {
                            async.forEach(cola_user1, function(item, callback) {

                                  conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${cola_vm[0].ip_vm}', '${item.motivo}','${cola_user[0].usuario}', 'up')`,function(error, results, fields) {
                                    var json = {'user' : cola_user[0].usuario, 'motivo' : item.motivo};
                                    getSocketFromIP(cola_vm[0].ip_vm).emit('load', json);

                                    if (item == cola_user1[cola_user1.length-1]) {
                                      logger.info(`es el ultimo`);
                                      resolve('salir');
                                    }
                                  });


                                }, function(err) {
                                    if (err) logger.info(err);}
                              );
                            }
                            else{
                              resolve('false');
                            }

                          });




                      });

                    });

                  });



                  promise2.then(function(result) {
                    if (result != 'false') {
                    conexion.query(`SELECT * FROM Cola AS c1 LIMIT 1`,function(error, cola_user, fields) {
                      conexion.query(`SELECT * FROM VMS AS v1 ORDER BY prioridad ASC LIMIT 1`,function(error, cola_vm, fields) {
                      conexion.query(`SELECT count(DISTINCT usuario) AS total FROM (SELECT DISTINCT usuario from Asignaciones as a1 WHERE ip_vm='${cola_vm[0].ip_vm}' UNION SELECT DISTINCT usuario FROM Pendientes as p1 WHERE ip_vm='${cola_vm[0].ip_vm}') AS tmp`,function(error, numero_users_vm, fields) {
                        logger.info(`tiene "${numero_users_vm[0].total}" usuarios la maquina virtual`);
                        if (numero_users_vm[0].total == config.numero_max_users) {
                        conexion.query(`DELETE FROM VMS WHERE ip_vm='${cola_vm[0].ip_vm}'`,function(error, cola_vm, fields) {
                            logger.info(`eliminado 1`);
                              });
                        }
                        else{

                          conexion.query(`UPDATE VMS SET prioridad=0 WHERE ip_vm='${cola_vm[0].ip_vm}'`,function(error, results, fields) {
                            logger.info(`actualizamos vm`);
                          });

                        }

                            conexion.query(`DELETE FROM Cola WHERE usuario='${cola_user[0].usuario}'`,function(error, results, fields) {
                              logger.info(`enviado a vm`);
                              conexion.query('UNLOCK TABLES',function(error, results, fields) {
                              conexion.release();
                              ajustaVMArrancadas();

                            });
                            });

                        });

                    });


                  });
                }
                else{
                  conexion.query('UNLOCK TABLES',function(error, results, fields) {
                  conexion.release();
                  //ajustaVMArrancadas();

                });
                }


                  }, function(err) {
                    logger.info(err);
                  });



                  }
                  else{
                    conexion.query('UNLOCK TABLES',function(error, results, fields) {
                    conexion.release();
                    ajustaVMArrancadas();

                  });
                  }
                });
                });






    }, function(err) {
      logger.info(err);
    });


              }
                else{
                  logger.info(`bool es falso`);
                  conexion.query('UNLOCK TABLES',function(error, results, fields) {
                  conexion.release();
                  ajustaVMArrancadas();

                });
                }

              }, function(err) {
                        logger.info(err);
                      });
              });
            });
  });



  });


module.exports = {
  wsClient,
  mapUserSocket,
  broadcastClient,
};
