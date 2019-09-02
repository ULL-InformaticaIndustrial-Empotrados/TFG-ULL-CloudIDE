const sio = require('socket.io');

const logger = require('./logger.js').child({ label: 'vms' });

logger.info('Comienza modulo js');

const config = require('./config.json');
const functions = require('./functions.js');
const db = require('./database.js');
const cli = require('./clientes.js');
const ovirt = require('./ovirt.js');
const serv = require('./servidores.js');
const firewall = require('./firewall.js');

const wsVMs = sio(config.puerto_wsVMs, {
  pingTimeout: 3000,
  pingInterval: 3000,
});


const mapIpVMS = new Map();

function getSocketFromIP(ip) {
  return mapIpVMS.get(ip)[mapIpVMS.get(ip).length - 1];
}

// Clase para las excepciones propias
class Condicion {
  constructor(msg) {
    this.msg = msg;
  }
}


// Actuliza estado de la VM según el número de usuarios asignados
// Se le pasa conexion suponiendo tablas bloqueadas
async function actulizaVM(conexion, ipVM) {
  const existe = (await conexion.query(`SELECT COUNT(*) AS total
    FROM VMS as v1 WHERE ip_vm='${ipVM}'`))[0].total > 0;

  const numeroUsersVM = (await conexion.query(`SELECT
    count(DISTINCT usuario) AS total FROM
    (SELECT DISTINCT usuario from Asignaciones as a1
      WHERE ip_vm='${ipVM}' UNION
      SELECT DISTINCT usuario FROM Pendientes as p1
      WHERE ip_vm='${ipVM}')
    AS tmp`))[0].total;
  logger.info(`La VM ${ipVM} tiene ${numeroUsersVM}" usuarios`);
  if (numeroUsersVM >= config.numero_max_users) {
    if (existe) {
      await conexion.query(`DELETE FROM VMS WHERE ip_vm='${ipVM}'`);
      logger.info(`Eliminada VM ${ipVM} de las VMs disponibles`);
    }
  } else if (existe) {
    await conexion.query(`UPDATE VMS SET prioridad=0 WHERE ip_vm='${ipVM}'`);
    logger.info(`Actulizamos VM ${ipVM} a prioridad 0`);
  } else {
    await conexion.query(`INSERT INTO VMS (prioridad, ip_vm) VALUES (0,'${ipVM}')`);
    logger.info(`Añadimos VM ${ipVM} con prioridad 0`);
  }
}

async function mandaUsuarioVM(conexion, usuario, ipVM) {
  if (mapIpVMS.get(ipVM) === undefined) {
    throw new Condicion(`La máquina ${ipVM} en cola no tiene socket`);
  }
  const motivos = await conexion.query(`SELECT * FROM Cola AS c1
    WHERE usuario='${usuario}'`);
  logger.debug(`La máquina ${ipVM} tiene socket (está activa)`);
  for (const item of motivos) {
    logger.info(`Asignamos (${usuario}, ${item.motivo}) a máquina ${ipVM}`);
    await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
      VALUES ('${ipVM}', '${item.motivo}', '${usuario}', 'up')`);
    const json = { user: usuario, motivo: item.motivo };
    getSocketFromIP(ipVM).emit('load', json);
  }
  await conexion.query(`DELETE FROM Cola WHERE usuario='${usuario}'`);
  logger.info(`Usurio ${usuario} enviado a VM ${ipVM} y borrado Cola`);
  await actulizaVM(conexion, ipVM);
}

// Mira si hay VMs y motivos en cola y asigna los de un usuario
// a una máquina.
// Cicla hasta que no pueda hacer más asignaciones
// Se le pasa conexion suponiendo tablas bloqueadas
async function miraCola(conexion) {
  while (true) {
    const nEnCola = (await conexion.query(`SELECT COUNT(*)
      AS total FROM Cola AS c1`))[0].total;
    const nVMs = (await conexion.query(`SELECT COUNT(*)
      AS total FROM VMS AS v1`))[0].total;
    logger.info(`Hay maquinas ${nVMs} libres y ${nEnCola} en la cola`);

    if ((nVMs <= 0) || (nEnCola <= 0)) break;

    const { usuario } = (await conexion.query('SELECT * FROM Cola AS c1 LIMIT 1'))[0];
    const ipVM = (await conexion.query(`SELECT * FROM VMS AS v1
      ORDER BY prioridad ASC LIMIT 1`))[0].ip_vm;

    await mandaUsuarioVM(conexion, usuario, ipVM);
  }
}

// Funcion vmfree PARA ELIMINAR
async function vmfree() {
  logger.info('Entramos vmfree');
  const pool = await db.pool;
  const conexion = await pool.getConnection();
  await conexion.query(db.bloqueoTablas);

  await miraCola(conexion);

  await conexion.query('UNLOCK TABLES');
  await conexion.release();
  vmfree();
}
// FIN Funcion vmfree

wsVMs.on('connection', async (socket) => {
  const ipVM = functions.cleanAddress(socket.handshake.address);
  logger.info(`Conexión de "${socket.id}" Con ip "${ipVM}"`);

  if (mapIpVMS.get(ipVM) === undefined) {
    mapIpVMS.set(ipVM, []);
  }

  mapIpVMS.get(ipVM).push(socket);

  logger.info(`mapIpVMS tiene longitud > "${mapIpVMS.size}"`);

  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);
  } catch (err) {
    const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
    logger.err(msg);
    return;
  }
  try {
    const existePendientesOvirt = (await conexion.query(`SELECT *
      FROM Ovirt_Pendientes as ovp WHERE ip_vm='${ipVM}'`));
    if (existePendientesOvirt.length > 0) {
      if (existePendientesOvirt[0].tipo === 'down') {
        throw new Condicion(`La VM ${ipVM} está en estado 'down'`);
      }
      await conexion.query(`DELETE FROM Ovirt_Pendientes WHERE ip_vm='${ipVM}'`);
    }
    await actulizaVM(conexion, ipVM);
    logger.info(`La VM ${ipVM} ha arrancado`);
    await miraCola(conexion);
  } catch (err) {
    if (err instanceof Condicion) {
      logger.info(err.msg);
    } else {
      logger.warn(`Error en 'connection' de ${ipVM}: ${err}`);
    }
  }
  await conexion.query('UNLOCK TABLES');
  await conexion.release();
  ovirt.ajustaVMArrancadas();

  socket.on('disconnect', async () => {
    logger.info(`VM disconnected "${ipVM}"`);

    if (mapIpVMS.get(ipVM) === undefined) {
      logger.warn(`La VM ${ipVM} se está desconectando pero no estaba registrada`);
      return;
    }
    if (mapIpVMS.get(ipVM).length <= 0) {
      logger.warn(`La VM ${ipVM} se está desconectando pero no tiene sockests`);
      return;
    }
    mapIpVMS.get(ipVM).shift().disconnect();
    if (mapIpVMS.get(ipVM).length > 0) {
      logger.error(`La VM ${ipVM} se está desconectando y tiene + de 1 socket`);
      return;
    }
    mapIpVMS.delete(ipVM);
    let conex;
    try {
      const pool = await db.pool;
      conex = await pool.getConnection();
      await conex.query(db.bloqueoTablas);
    } catch (err) {
      const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
      logger.err(msg);
      return;
    }
    await conex.query(`DELETE FROM VMS WHERE ip_vm='${ipVM}'`);
    await conex.query('UNLOCK TABLES');
    await conex.release();
  });


  socket.on('loaded', async (data) => {
    logger.info(`Che server loaded "${JSON.stringify(data)}"`);
    let conex;
    try {
      const pool = await db.pool;
      conex = await pool.getConnection();
      await conex.query(db.bloqueoTablas);
    } catch (err) {
      const msg = `Al obtener pool, conexion o bloquear tablas: ${err}`;
      logger.err(msg);
      return;
    }
    const { user, motivo, puerto } = data;
    try {
      const pen = (await conex.query(`SELECT * FROM Pendientes AS p1
        WHERE ip_vm='${ipVM}' AND motivo='${motivo}' AND usuario='${user}'`));

      if (pen.length > 0) {
        await conex.query(`INSERT INTO Asignaciones (ip_vm, usuario, motivo, puerto)
          VALUES ('${ipVM}','${pen[0].usuario}','${pen[0].motivo}', ${puerto})`);

        logger.info(`es del usuario "${pen[0].usuario}"`);
        const row = (await conex.query(`SELECT COUNT(*) AS total
          FROM Asignaciones AS a1 WHERE usuario='${pen[0].usuario}'`))[0].total;
        const firewall1 = await conex.query(`SELECT ip_origen FROM Firewall AS f1
          WHERE usuario='${pen[0].usuario}'`);
        if ((firewall1.length > 0)) {
          logger.info(`El usuario ${pen[0].usuario} tiene IP en Firewall`);
          for (const item of firewall1) {
            if (row <= 1) {
              serv.broadcastServers('añadircomienzo', { ip_origen: item.ip_origen, ipVM, puerto });
              await firewall.dnatae('añadircomienzo', item.ip_origen, ipVM, 0);
            }
            serv.broadcastServers('añadirsolo', { ip_origen: item.ip_origen, ipVM, puerto });
            await firewall.dnatae('añadirsolo', item.ip_origen, ipVM, puerto);
          }
          if (cli.mapUserSocket.get(pen[0].usuario) !== undefined) {
            cli.broadcastClient(pen[0].usuario, 'resultado', { motivo });
          } else {
            serv.broadcastServers('enviar-resultado', { motivo, user });
          }
        }
        await conex.query(`DELETE FROM Pendientes
          WHERE usuario='${pen[0].usuario}' AND motivo='${pen[0].motivo}' AND tipo='up'`);
        logger.info(`Pendiente ${user}-${motivo}`);
      }

      // comprobamos si el servicio se está eliminando
      const elimServ = (await conex.query(`SELECT count(*) AS total
        FROM Eliminar_servicio as es WHERE motivo='${motivo}'`))[0].total;
      const elimServUser = (await conex.query(`SELECT COUNT(*) AS total FROM Eliminar_servicio_usuario
        WHERE usuario='${user}' AND motivo='${motivo}'`))[0].total;
      if ((elimServ + elimServUser) > 0) {
        logger.info(`El servicio ${user}-${motivo} se está eliminando`);
        if (mapIpVMS.get(ipVM) !== undefined) {
          await conex.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
            VALUES ('${ipVM}', '${motivo}','${user}', 'down')`);
          getSocketFromIP(ipVM).emit('stop', { user, motivo, puerto });
          logger.info(`enviado stop para ${user}-${motivo}`);
        }
      }
    } catch (err) {
      if (err instanceof Condicion) {
        if (cli.mapUserSocket.get(user) !== undefined) {
          socket.emit('data-error', { msg: err.msg });
        }
        logger.info(err.msg);
      } else {
        logger.warn(`Error en 'loaded' '${user}'-'${motivo}': ${err}`);
      }
    }
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  });

// Fin de 'loaded'

// POR AQUI



    socket.on('stopped', function (data) {
      logger.info(`Che server stopped "${JSON.stringify(data)}"`);
      pool.getConnection(function(err, connection) {
      var conexion = connection;
      conex.query(db.bloqueoTablas,function(error, results, fields) {
        conex.query("SELECT * FROM Asignaciones AS a1 WHERE ip_vm='${ipVM}' AND motivo='${data.motivo}' AND usuario='${data.user}'",function(error, asignaciones, fields) {
          logger.info(`tamaño "${asignaciones.length}"`);

            var promise = new Promise(function(resolve, reject) {
                if (asignaciones.length != 0) {
                  conex.query("DELETE FROM Asignaciones WHERE motivo='${asignaciones[0].motivo}' AND usuario='${asignaciones[0].usuario}'",function(error, results, fields) {
                      conex.query("DELETE FROM Pendientes WHERE usuario='${asignaciones[0].usuario}' AND motivo='${asignaciones[0].motivo}' AND tipo='down'",function(error, results, fields) {
                        conex.query("SELECT count(DISTINCT usuario) AS total FROM (SELECT DISTINCT usuario from Asignaciones as a1 WHERE ip_vm='${asignaciones[0].ip_vm}' UNION SELECT DISTINCT usuario FROM Pendientes as p1 WHERE ip_vm='${asignaciones[0].ip_vm}') AS tmp",function(error, numero_users_vm, fields) {
                          conex.query("SELECT count(*) AS total FROM VMS AS v1 WHERE ip_vm='${asignaciones[0].ip_vm}'",function(error, existe_vm, fields) {
                            var promise2 = new Promise(function(resolve, reject) {
                              logger.info(`tiene "${numero_users_vm[0].total}"`);
                              if (numero_users_vm[0].total == 0) {
                                if (existe_vm[0].total != 0) {
                                  logger.info(`liberando vm...`);

                                conex.query("UPDATE VMS SET prioridad=1 WHERE ip_vm='${ipVM}'",function(error, results, fields) {
                                  resolve();
                                });
                              }
                              else{
                                logger.info(`liberando vm...`);

                              conex.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (1,'${ipVM}')",function(error, results, fields) {
                                resolve();
                              });
                              }
                              }
                              else if (numero_users_vm[0].total < config.numero_max_users) {
                                if (existe_vm[0].total != 0) {
                                logger.info(`actualizo vm`);
                                conex.query("UPDATE VMS SET prioridad=0 WHERE ip_vm='${ipVM}'",function(error, results, fields) {
                                  if (error) logger.info(error);
                                  resolve();
                                });
                              }
                              else{
                                logger.info(`actualizo vm`);
                                conex.query("INSERT INTO VMS (prioridad, ip_vm) VALUES (0,'${ipVM}')",function(error, results, fields) {
                                  if (error) logger.info(error);
                                  resolve();
                                });
                              }
                              }
                              else{
                                resolve();
                              }
                            });

                            promise2.then(function(result) {

                              conex.query("SELECT COUNT(*) AS total FROM Asignaciones AS a1 WHERE usuario='${asignaciones[0].usuario}'",function(error, total_asignaciones_user, fields) {
                                conex.query("SELECT ip_origen FROM Firewall AS f1 WHERE usuario='${asignaciones[0].usuario}'",function(error, firewall1, fields) {
                                  if (firewall1.length != 0) {
                                    if (total_asignaciones_user[0].total != 0) {

                                      var min = 0;
                                      var max = firewall1.length;

                                      var bucle = function() {
                                        if (min < max) {
                                          serv.broadcastServers("dnatae-eliminarsolo", {"ip_origen" : firewall1[min].ip_origen, "ipVM" : asignaciones[0].ip_vm, "puerto" : data.puerto});
                                          firewall.dnatae("eliminarsolo", firewall1[min].ip_origen, asignaciones[0].ip_vm, data.puerto, function() {
                                            min++;
                                            bucle();
                                          });

                                        }
                                        else{
                                          if (mapUserSocket.get(asignaciones[0].usuario) != undefined) {
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

                                      var bucle = function() {
                                        if (min < max) {
                                          serv.broadcastServers("deletednat", firewall1[min].ip_origen);
                                          firewall.deletednat(firewall1[min].ip_origen, function() {
                                            min++;
                                            bucle();
                                          });

                                        }
                                        else{
                                          if (mapUserSocket.get(asignaciones[0].usuario) != undefined) {
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

              conex.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${data.motivo}'",function(error, total, fields) {
                if (total[0].total != 0) {

                  conex.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                    conex.query("DELETE FROM Matriculados WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                      conex.query("DELETE FROM Ultima_conexion WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                        conex.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${data.motivo}'",function(error, result, fields) {
                          if (result[0].total == 0) {
                            functions.eliminardirectoriotodo(data.motivo, function() {
                              pool.getConnection(function(err, connection) {
                                connection.query(db.bloqueoTablas,function(error, results, fields) {
                                  connection.query("DELETE FROM Eliminar_servicio WHERE motivo='${data.motivo}'",function(error, result, fields) {
                                    connection.query("DELETE FROM Servicios WHERE motivo='${data.motivo}'",function(error, result, fields) {
                                      connection.query("UNLOCK TABLES",function(error, results, fields) {
                                        connection.release();
                                      });
                                    });
                                  });
                                });
                              });
                            });
                            conex.query("UNLOCK TABLES",function(error, results, fields) {
                              logger.debug(`liberando tablas MySQL`);
                            conex.release();

                            vmfree();
                            ovirt.ajustaVMArrancadas();
                          });
                          }
                          else{
                            conex.query("UNLOCK TABLES",function(error, results, fields) {
                              logger.debug(`liberando tablas MySQL`);
                            conex.release();

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
                  conex.query("SELECT COUNT(*) AS total FROM (SELECT motivo FROM `Eliminar_servicio_usuario` as esu WHERE usuario='${data.user}' AND motivo='${data.motivo}' UNION SELECT motivo FROM Eliminar_servicio as es WHERE motivo='${data.motivo}') AS alias",function(error, result, fields) {
                    if (result[0].total != 0) {




                      functions.eliminardirectoriosolo(data.user, data.motivo, function() {
                        pool.getConnection(function(err, conexion) {
                          conex.query(db.bloqueoTablas,function(error, results, fields) {
                            conex.query("SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${data.motivo}'",function(error, result, fields) {
                              if (result[0].total == 0) {
                                conex.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                  conex.query("DELETE FROM Matriculados WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                    conex.query("DELETE FROM Ultima_conexion WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                      conex.query("UNLOCK TABLES",function(error, results, fields) {
                                        conex.release();
                                      });
                                    });
                                  });
                                });
                              }
                              else{
                                conex.query("DELETE FROM Eliminar_servicio_usuario WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                  conex.query("DELETE FROM Matriculados WHERE usuario='${data.user}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                    conex.query("DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${data.motivo}'",function(error, result, fields) {
                                      conex.query("SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${data.motivo}'",function(error, result, fields) {
                                        if (result[0].total == 0) {
                                          functions.eliminardirectoriotodo(req.body['nombreservicio'], function() {
                                            pool.getConnection(function(err, connection) {
                                              connection.query(db.bloqueoTablas,function(error, results, fields) {
                                                connection.query("DELETE FROM Eliminar_servicio WHERE motivo='${data.motivo}'",function(error, result, fields) {
                                                  connection.query("DELETE FROM Servicios WHERE motivo='${data.motivo}'",function(error, result, fields) {
                                                    connection.query("UNLOCK TABLES",function(error, results, fields) {
                                                      connection.release();
                                                    });
                                                  });
                                                });
                                              });
                                            });
                                          });
                                          conex.query("UNLOCK TABLES",function(error, results, fields) {
                                            conex.release();
                                          });
                                        }
                                        else{
                                          conex.query("UNLOCK TABLES",function(error, results, fields) {
                                            conex.release();
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

                    conex.query("UNLOCK TABLES",function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    conex.release();

                    vmfree();
                    ovirt.ajustaVMArrancadas();
                  });


                    }
                    else{
                      conex.query("UNLOCK TABLES",function(error, results, fields) {
                        logger.debug(`liberando tablas MySQL`);
                      conex.release();

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
