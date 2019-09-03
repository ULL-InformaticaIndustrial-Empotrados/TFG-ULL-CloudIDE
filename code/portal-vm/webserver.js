const express = require('express');
const bodyParser = require('body-parser');

const logger = require('./logger.js').child({ label: 'websrv' });

logger.info('Comienza modulo webserver.js');

const functions = require('./functions.js');
const db = require('./database.js');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/cloud', express.static('./client/views'));
app.use('/', express.static('./client/views'));

app.set('views', './client/views'); // Configuramos el directorio de vistas
app.set('view engine', 'ejs');

const palabraInicial = new RegExp(/\w*/);

class Condicion {
  constructor(msg) {
    this.msg = msg;
  }
}

// Funcion asíncrona para determinar rol del usuario
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

app.get('/', async (req, res) => {
  const ip_origen = functions.cleanAddress(req.conexion.remoteAddress);
  if (req.session.user === undefined) {
    serv.broadcastServers('deletednat', ip_origen);
    await firewall.deletednat(ip_origen);
    let conexion;
    try {
      const pool = await db.pool;
      conexion = await pool.getConnection();
      await conexion.query(`DELETE FROM Firewall
        WHERE ip_origen='${functions.cleanAddress(req.conexion.remoteAddress)}'`);
      await conexion.release();
    } catch (err) {
      logger.err(`Al borrar de tabla Firewall: ${err}`);
    }
    res.render('index', {});
  } else if (ip_origen != req.session.ip_origen) {
      logger.info(`IP logueo ${ip_orige} != de la de sesión ${req.session.ip_origen}`);
      res.redirect('/logout');
  } else {
    res.redirect('/controlpanel');
  }
});


app.get('/controlpanel', async (req,res) => {
  const ip_origen = functions.cleanAddress(req.conexion.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ip_origen != req.session.ip_origen) {
    logger.info(`IP logueo ${ip_orige} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }
  const { user, rol } = req.session;
  logger.info(`El usuario ${user} accede a /controlpanel'`);
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    const upped = await conexion.query(`SELECT * FROM Matriculados
      NATURAL JOIN Asignaciones WHERE usuario='${user}'
      AND motivo NOT IN (
        SELECT motivo FROM Pendientes WHERE tipo='down' AND usuario='${user}')`);
    const upping = await conexion.query(`SELECT usuario, motivo
      FROM Matriculados NATURAL JOIN Pendientes WHERE usuario='${user}'
      AND tipo='up' UNION ALL SELECT usuario, motivo FROM Matriculados
      NATURAL JOIN Cola WHERE usuario='${user}'`);
    const dowing = await conexion.query(`SELECT * FROM Matriculados
      NATURAL JOIN Asignaciones NATURAL JOIN Pendientes
      WHERE usuario='${user}'`);
    const rest = await conexion.query(`SELECT * FROM Matriculados
      WHERE usuario='${user}' AND motivo NOT IN
      (SELECT motivo FROM Pendientes WHERE usuario='${user}'
      UNION SELECT motivo FROM Asignaciones WHERE usuario='${user}'
      UNION SELECT motivo FROM Cola WHERE usuario='${user}')`);

    let destino = 'controlpanelalumno';
    const data = {
      ip_server_che: config.ip_server_exterior,
      user,
      encendidos: upped,
      apagandose: dowing,
      encendiendose: upping,
      resto : rest
    };

    if (rol === 'profesor') {
      const motivos = await conexion.query(`SELECT motivo FROM Servicios
        WHERE usuario='${user}' AND motivo NOT IN
        (SELECT motivo FROM Eliminar_servicio)`);
      logger.info(`Usuario ${user} es profesor con ${motivos.length} servicios`);
      var tservicios = [];
      // var max = motivos.length;
      // var min = 0;
      for (const srvAct of motivos) {
        const { motivo } = srvAct;
        const usersMatUp = await conexion.query(`SELECT * FROM Matriculados
          NATURAL JOIN Ultima_conexion WHERE motivo='${motivo}'
          AND usuario NOT IN
          ( SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='${motivo}')`);
        const usersMot = await conexion.query(`SELECT usuario FROM Asignaciones
          WHERE motivo='${motivo}'`);
        const set = new Set();
        const usuarios = [];
        for (const ua of usersMot) {
          set.add(ua.usuario);
        }
        for (const ua of usersMatUp) {
          if (set.has(ua.usuario)) {
            usuarios.push({
              usuario: ua.usuario,
              estado: 'up',
              fecha: ua.fecha,
            });
          }
          else{
            var a =
            usuarios.push({
              usuario: ua.usuario,
              estado: 'down',
              fecha : ua.fecha});
          }
        }
        tservicios.push({ motivo, usuarios });
      }
      destino = 'controlpanelprofesor';
      data['servicios'] = tservicios;
    }
  } catch (err) {
    logger.error(`Error al tratar /controlpanel: ${err}`);
  }
  if (conexion) await conexion.release();
  res.render(destino, data);
});

app.get('/cloud/:motivo', async (req, res) => {
  const ip_origen = functions.cleanAddress(req.conexion.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ip_origen != req.session.ip_origen) {
    logger.info(`IP logueo ${ip_orige} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }
  const { user } = req.session;
  const { motivo } = req.params;
  let destino ='error';
  let data = {};
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    const row = await conexion.query(`SELECT * FROM Asignaciones
      WHERE usuario='${user}' AND motivo='${motivo}'`);
        // if (err) throw err;
        // conexion.release();
    if (row.length > 0) {
      await conexion.query(`UPDATE Ultima_conexion
        SET fecha='${functions.dateFormat()}'
        WHERE usuario='${user}' AND motivo='${motivo}'`);
      destino = 'cloud';
      data = {
        user,
        motivo,
        ip_server_che: config.ip_server_exterior,
        port_server_che: row[0].puerto};
    }
  } catch(err) {
    logger.error(`Error al trtar /cloud:${motivo}`);
  }
  if (conexion) await conexion.release();
  res.render(destino, data);
});

app.get('/autenticacion', cas.bounce, async (req, res) => {
  const ip_origen = functions.cleanAddress(req.conexion.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ip_origen != req.session.ip_origen) {
    logger.info(`IP logueo ${ip_orige} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }

  //borrar iptables de esta ip por si acaso
  serv.broadcastServers('deletednat', ip_origen);
  await firewall.deletednat(ip_origen);
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ip_origen}'`);

    const user = req.session[`cas_userinfo`].username;
    req.session.user = user;
    req.session.ip_origen = ip_origen;
    const rol = await getRoll(user);
    req.session.rol = rol;
    logger.info(`Usuario ${user} considerado '${rol}'`);
    await conexion.query(`INSERT INTO Firewall (usuario, ip_origen)
      VALUES ('${user}','${ip_origen}')`);

    //Actualizamos iptables
    const asignasUser = await conexion.query(`SELECT ip_vm, puerto FROM Asignaciones
      WHERE usuario='${user}'`);
    await conexion.release();
    if (asignasUser.length > 0) {
      const asigIni = asignasUser[0];   // Primera asignación
      //TODO esto debería ser objeto, no string
      serv.broadcastServers('añadircomienzo', `${ip_origen } ${asigIni.ip_vm} ${asigIni.puerto}`);
      await firewall.dnatae('añadircomienzo', ip_origen, asigIni.ip_vm, 0);
      for (const asigA of asignasUser) {
        //TODO esto debería ser objeto, no string
        serv.broadcastServers('añadirsolo', `${ip_origen} ${asigA.ip_vm} ${asigA.puerto}`);
        await firewall.dnatae('añadirsolo', ip_origen, asigA.ip_vm, asigA.puerto);
      }
    }
  } catch (err) {
    logger.error(`Error al tratar /autenticacion`);
  }
  setTimeout(() => {
    res.redirect('/controlpanel');
  }, 3000);
});

app.get('/logout',cas.logout, async (req, res) => {
  const ip_origen = functions.cleanAddress(req.conexion.remoteAddress);

  await firewall.tcpkillestablished(ip_origen);

  const { user } = req.session;

  req.session.user = undefined;
  req.session.ip_origen = undefined;
  req.session.destroy();

  serv.broadcastServers('deletednat', ip_origen);
  await firewall.deletednat(ip_origen);
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ip_origen}'`);
    conexion.release();
  } catch (err) {
    logger.error(`Error al tratar /logout`);
  }
  setTimeout(() => {
    if (mapUserSocket.get(user) !== undefined) {
      cli.broadcastClient(user, `reload`,``);
    }
    res.redirect('/');
  },4000);
});

app.get('/comprobardisponibilidad', async (req, res) => {
  if (req.session.user === undefined) {
    res.send('no disponible');
    return;
  }
  if (req.session.rol !== 'profesor') {
    res.send('no disponible');
    return;
  }
  let conexion = undefined;
  const datos = {};
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    const total = (await conexion.query(`SELECT count(*) AS total FROM
      Servicios WHERE motivo='${req.query.nombre}'`))[0].total;
    datos['valido'] = (total <= 0);
    await conexion.release();
  } catch(err) {
    logger.error(`Error al trtar /cloud:${motivo}`);
  }
  res.send(datos);
})


app.post('/nuevoservicio', async (req, res) => {
  if (req.session.user === undefined) {
    logger.warn(`No hay user invocando /nuevoservicio`);
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn(`No es 'profesor' invocando /nuevoservicio`);
    return;
  }
  const nombServi = functions.getCleanedString(req.body['nombreservicio']);
  req.body['nombreservicio'] = nombServi;
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);
    const totServ = (await conexion.query(`SELECT count(*) AS total
      FROM Servicios as s1 WHERE motivo='${nombServi}'`))[0].total;
    if (totServ > 0) {
      throw new Condicion(`En /nuevoservicio '${nombServi}'' ya existe`);
    }
    await conexion.query(`INSERT INTO Servicios (usuario, motivo)
      VALUES ('${req.session.user}','${nombServi}')`);
    let valores = req.body['usuario'];
    if (valores !== undefined) {
      if (!valores instanceof Array) {
        valores = [ valores ];
      }
      for (const item of valores) {
        const aux = item.match(palabraInicial);
        await conexion.query(`INSERT INTO Matriculados (usuario, motivo)
          SELECT '${aux}','${nombServi}' FROM dual
          WHERE NOT EXISTS (
            SELECT * FROM Matriculados as m1 WHERE usuario='${aux}'
            AND motivo='${nombServi}')`);
        await conexion.query(`INSERT INTO Ultima_conexion (usuario, motivo)
          SELECT '${aux}','${nombServi}' FROM dual
          WHERE NOT EXISTS (
            SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}'
            AND motivo='${nombServi}')`);
      }
    }
  } catch (err) {
    if (err instanceof Condicion) {
      logger.info(err.msg);
    } else {
      logger.warn(`Error en '/nuevoservicio': ${err}`);
    }
  }
  if (conexion !== undefined) {
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  }
  res.redirect('/controlpanel');
});


app.post('/eliminarservicio', async (req, res) => {
  if (req.session.user === undefined) {
    logger.warn(`No hay user invocando /eliminarservicio`);
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn(`No es 'profesor' invocando /eliminarservicio`);
    return;
  }
  const nombServi = functions.getCleanedString(req.body['nombreservicio']);
  req.body['nombreservicio'] = nombServi;
  let conexion = undefined;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);

    const totServi = (await conexion.query(`SELECT count(*) AS total FROM Servicios as s1
      WHERE motivo='${nombServi}' AND usuario='${req.session.user}'`))[0].total;
    if (totServi <= 0) {
      throw new Condicion(`El servicio ${nombServi} no exist para usuario ${req.session.user}`);
    }
    const elimServi = (await conexion.query(`SELECT count(*) AS total
      FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`))[0].total;
    if (elimServi > 0) {
      throw new Condicion(`El servicio ${nombServi} ya se está eliminando`);
    }
    await conexion.query(`INSERT INTO Eliminar_servicio (motivo) VALUES ('${nombServi}')`);
    const matriculados = await conexion.query(`SELECT usuario FROM Matriculados as m1
      WHERE motivo='${nombServi}' AND usuario NOT IN
      (SELECT usuario FROM Eliminar_servicio_usuario WHERE motivo='${nombServi}')`);
    for (const ma of matriculados) {
      const { usuario } = ma;
      const pendiente = (await conexion.query(`SELECT count(*) AS total FROM Pendientes as p1
        WHERE motivo='${nombServi}' AND usuario='${usuario}'`))[0].total;
      if (pendiente <= 0) {
        await conexion.query(`DELETE FROM Cola WHERE usuario='${usuario}' AND motivo='${nombServi}'`);
        const estaasignado = await conexion.query(`SELECT * FROM Asignaciones as a1
          WHERE motivo='${nombServi}' AND usuario='${usuario}'`);
        if (estaasignado.length <= 0) { // si no está encendido
          vms.compruebaEliminarServicioUsuario(conexion, nombServi, usuario);
        } else {
          const ipVM = vms.mapIpVMS.get(estaasignado[0].ip_vm);
          if ( ipVM === undefined) {
            logger.warn(`No hay IP para asignación de '${usuario}'-'${nombServi}'`);
          } else {
            var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
            await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
              VALUES ('${estaasignado[0].ip_vm}', '${nombServi}','${usuario}', 'down')`);
            var json = { user: usuario, motivo: nombServi, puerto: estaasignado[0].puerto };
            socket_vm.emit('stop', json);
            logger.info(`Enviado stop ${JSON.stringify(json)} a ${ipVM}`);
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Condicion) {
      logger.info(err.msg);
    } else {
      logger.warn(`Error en '/eliminarservicio': ${err}`);
    }
  }
  if (conexion !== undefined) {
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  }
  res.redirect('/controlpanel');
});

// AQUI ///////////////////////////////


app.post('/aniadirusuarios', function(req,res) {
  if (req.session.user != undefined) {
    if (req.session.rol == `profesor`) {
      pool.getConnection(function(err, conexion) {
        conexion.query(db.bloqueoTablas,function(error, results, fields) {
          conexion.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${nombServi}' AND usuario='${req.session.user}'`,function(error, total, fields) {
            if (total[0].total == 1) {
              conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`,function(error, result, fields) {
                if (result[0].total == 0) {
                var valores = req.body['usuario'];
                if (valores != undefined) {
                  if (valores instanceof Array) {
                    async.forEach(valores, function(item, callback) {
                      var aux = item.match(palabraInicial);
                      conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                        if (total[0].total == 0) {
                          conexion.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                            conexion.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                                conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                if (item == valores[valores.length-1]) {
                                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                      logger.debug(`liberando tablas MySQL`);
                                    conexion.release();
                                    res.redirect('/controlpanel');
                                  });
                                }
                              });
                            });
                          });
                        }
                        else{
                          if (item == valores[valores.length-1]) {
                            conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                logger.debug(`liberando tablas MySQL`);
                              conexion.release();
                              res.redirect('/controlpanel');
                            });
                          }
                        }
                      });
                    });

                  }
                  else{
                    var aux = valores.match(palabraInicial);
                    conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                      if (total[0].total == 0) {
                        conexion.query(`INSERT INTO Matriculados (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Matriculados as m1 WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                          conexion.query(`INSERT INTO Ultima_conexion (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                            conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                              conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                conexion.release();
                                res.redirect('/controlpanel');
                              });
                            });
                          });
                        });
                      }
                      else{
                        conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          conexion.release();
                          res.redirect('/controlpanel');
                        });
                      }
                    });
                  }
                }
                else{
                  logger.info(`ERROR -> No se han enviado usuarios`);
                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    conexion.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  conexion.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                conexion.release();
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
      pool.getConnection(function(err, conexion) {
        conexion.query(db.bloqueoTablas,function(error, results, fields) {
          conexion.query(`SELECT count(*) AS total FROM Servicios as s1 WHERE motivo='${nombServi}' AND usuario='${req.session.user}'`,function(error, total, fields) {
            if (total[0].total == 1) {
              conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`,function(error, result, fields) {
                if (result[0].total == 0) {
                var valores = req.body['usuario'];
                if (valores != undefined) {
                  if (valores instanceof Array) {
                    var max = valores.length;
                    var min = 0;

                    var bucle = function() {
                      if (min < max) {


                        var aux = valores[min];
                        conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                          if (total[0].total == 1) {
                            conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                              if (total[0].total == 0) {
                            conexion.query(`INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                              conexion.query(`SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                                if (total[0].total == 0) {
                                  conexion.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) { //por si acaso
                                  conexion.query(`SELECT * FROM Asignaciones as a1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, estaasignado, fields) {
                                    if (estaasignado.length == 0) {//si no está encendido
                                      functions.eliminardirectoriosolo(aux, nombServi, function() {
                                        pool.getConnection(function(err, conexion) {
                                          conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                            conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                              if (result[0].total == 0) {
                                                conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                  conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                    conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                      conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                        conexion.release();
                                                      });
                                                    });
                                                  });
                                                });
                                              }
                                              else{
                                                conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                  conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                    conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                      conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                        if (result[0].total == 0) {
                                                          functions.eliminardirectoriotodo(nombServi, function() {
                                                            pool.getConnection(function(err, conexion) {
                                                              conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                                                conexion.query(`DELETE FROM Eliminar_servicio WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                                  conexion.query(`DELETE FROM Servicios WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                                    conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                                      conexion.release();
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
                                        conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${estaasignado[0].ip_vm}', '${estaasignado[0].motivo}','${aux}', 'down')`,function(error, results2, fields) {
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
                        conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                          conexion.release();
                          res.redirect('/controlpanel');
                        });
                      }
                    }

                    bucle();


                  }
                  else{
                    var aux = valores;
                    conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                      if (total[0].total == 1) {
                        conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                          if (total[0].total == 0) {
                        conexion.query(`INSERT INTO Eliminar_servicio_usuario (usuario, motivo) SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS ( SELECT * FROM Eliminar_servicio_usuario as esu WHERE usuario='${aux}' AND motivo='${nombServi}')`,function(error, result, fields) {
                          conexion.query(`SELECT count(*) AS total FROM Pendientes as p1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, total, fields) {
                            if (total[0].total == 0) {
                              conexion.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) { //por si acaso
                              conexion.query(`SELECT * FROM Asignaciones as a1 WHERE motivo='${nombServi}' AND usuario='${aux}'`,function(error, estaasignado, fields) {
                                if (estaasignado.length == 0) {//si no está encendido
                                  functions.eliminardirectoriosolo(aux, nombServi, function() {
                                    pool.getConnection(function(err, conexion) {
                                      conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                        conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                          if (result[0].total == 0) {
                                            conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                              conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                    conexion.release();
                                                  });
                                                });
                                              });
                                            });
                                          }
                                          else{
                                            conexion.query(`DELETE FROM Eliminar_servicio_usuario WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                              conexion.query(`DELETE FROM Matriculados WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                conexion.query(`DELETE FROM Ultima_conexion WHERE usuario='${aux}' AND motivo='${nombServi}'`,function(error, result, fields) {
                                                  conexion.query(`SELECT count(*) AS total FROM Matriculados as m1 WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                    if (result[0].total == 0) {
                                                      functions.eliminardirectoriotodo(nombServi, function() {
                                                        pool.getConnection(function(err, conexion) {
                                                          conexion.query(db.bloqueoTablas,function(error, results, fields) {
                                                            conexion.query(`DELETE FROM Eliminar_servicio WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                              conexion.query(`DELETE FROM Servicios WHERE motivo='${nombServi}'`,function(error, result, fields) {
                                                                conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                                                  conexion.release();
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
                                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                    conexion.release();
                                    res.redirect('/controlpanel');
                                  });
                                }
                                else{ // si está encendido mandamos a apagar
                                  if (vms.mapIpVMS.get(estaasignado[0].ip_vm) != undefined) {
                                    var socket_vm = vms.getSocketFromIP(estaasignado[0].ip_vm);
                                    conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo) VALUES ('${estaasignado[0].ip_vm}', '${estaasignado[0].motivo}','${aux}', 'down')`,function(error, results2, fields) {
                                      var json = {`user` : aux, `motivo` : estaasignado[0].motivo, `puerto` : estaasignado[0].puerto};
                                      socket_vm.emit(`stop`, json);
                                        logger.info(`enviado stop`);
                                        conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                          conexion.release();
                                          res.redirect('/controlpanel');
                                        });
                                    });
                                  }
                                  else{
                                    conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                        logger.debug(`liberando tablas MySQL`);
                                      conexion.release();
                                      res.redirect('/controlpanel');
                                    });
                                  }
                                }
                              });
                            });
                            }
                            else{
                              conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                                  logger.debug(`liberando tablas MySQL`);
                                conexion.release();
                                res.redirect('/controlpanel');
                              });
                            }
                          });
                        });
                      }
                      else{
                        conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                            logger.debug(`liberando tablas MySQL`);
                          conexion.release();
                          res.redirect('/controlpanel');
                        });
                      }
                      });
                      }
                    else{
                      conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                          logger.debug(`liberando tablas MySQL`);
                        conexion.release();
                        res.redirect('/controlpanel');
                      });
                    }
                  });
                  }
                }
                else{
                  logger.info(`ERROR -> No se han enviado usuarios`);
                  conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                      logger.debug(`liberando tablas MySQL`);
                    conexion.release();
                    res.redirect('/controlpanel');
                  });
                }
              }
              else{
                logger.info(`ERROR -> ya se esta eliminando`);
                conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                    logger.debug(`liberando tablas MySQL`);
                  conexion.release();
                  res.redirect('/controlpanel');
                });
              }
              });
            }
            else{
              logger.info(`ERROR -> no existe en servicios`);
              conexion.query(`UNLOCK TABLES`,function(error, results, fields) {
                  logger.debug(`liberando tablas MySQL`);
                conexion.release();
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
