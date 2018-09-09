const logger = require('./logger.js');

logger.info(`Comienza la aplicacion backend`);

const config = require('./config.json');
const functions = require('./functions.js');
const MySqlAsync = require('mysql');
const sqlite3 = require('sqlite3').verbose();
// TODO Poner la base de datos en otro sitio
const db = new sqlite3.Database(config.path_db + 'cloudIDE.db');
db.serialize();  // Ponemos queris en modo serializado

const { exec } = require('child-process-promise');

async = require('async');

const array = [];
const socketClientServers = new Map();
const addresses = functions.getiplocal();

functions.cleandockerimages();

const bloqueoTablas = 'LOCK TABLES VMS WRITE, VMS as v1 READ, Servidores WRITE, Servidores as s1 READ, Firewall WRITE, Firewall as f1 READ, Pendientes WRITE, Pendientes as p1 READ, Asignaciones WRITE, Asignaciones as a1 READ, Cola WRITE, Cola as c1 READ';

const createNewConnection = () => {
  const connectionAsync = MySqlAsync.createPool({
    host: config.host_bbdd_mysql,
    user: config.user_bbdd_mysql,
    password: config.password_bbdd_mysql,
    database: config.database_bbdd_mysql,

    //debug : true,

    acquireTimeout: 60 * 60 * 1000,
    connectTimeout: 60 * 60 * 1000,
    connectionLimit: 1,
    queueLimit: 0,
  });
  logger.debug(`una conexion creada`);

  connectionAsync.on('release', (connection) => {
    logger.debug(`Connection ${connection.threadId} released`);
  });

  return connectionAsync;
};

const pool = createNewConnection();

logger.debug(`Dirección: "${addresses[0]}"`);

Set.prototype.difference = function (setB) {
  const difference = new Set(this);
  for (let elem of setB) {
    difference.delete(elem);
  }

  return difference;
};

const puertos = new Set();
let aux = config.puerto_inicial;
for (let i = 0; i < config.numero_max_serverxuser * config.numero_max_users; i++) {
  puertos.add(aux);
  aux += 1;
}

const puertosUsados = new Set();
const errores = new Array();

const promesa = new Promise((resolve, reject) => {
  db.run('CREATE TABLE IF NOT EXISTS Asignaciones (usuario TEXT, motivo TEXT, puerto INTEGER)');

  db.all(`SELECT * FROM Asignaciones`, [], (err, rows) => {
    if (err) {
      throw err;
    }

    logger.info(`longitud de filas "${rows.length}"`);

    const promesaErrores = new Promise((resolve, reject) => {
      if (rows.length == 0) {
        resolve();
        return;
      }
      rows.forEach((row) => {
        logger.info(`Comprobando puerto: "${row.puerto}"`);
        exec(__dirname + '/comprobarche.sh ' + config.rootpassword + ' ' + row.puerto)
          .then((result) => {
            logger.debug(`comprobarche salida estandar: "${result.stdout}"`);

            if (result.stdout == 'no existe\n') {
              logger.info(`El servidor en puerto ${row.puerto} no tiene nada`);
              db.run(`DELETE FROM Asignaciones WHERE puerto=?`, [row.puerto],
                (err) => {
                  if (err) {
                    return logger.info(err.message);
                  }

                  errores.push({ motivo: row.motivo, user: row.usuario, puerto: row.puerto, });
                }
              );
            } else {
              logger.info(`si que existe`);
              puertosUsados.add(row.puerto);
            }

            if (row == rows[rows.length - 1]) { //es el ultimo
              resolve();
            }
          }
        )
        .catch((err) => {
          logger.warn(`Error comprobarche: "${error}"`);
        });
      });
    });

    promesaErrores.then((result) => {
      pool.getConnection((err, connection) => {
        connection.query(bloqueoTablas, (error, results, fields) => {
          connection.query('SELECT * FROM Servidores AS s1', (error, servers, fields) => {
            connection.query('UNLOCK TABLES', (error, results, fields) => {
              connection.release();
            });

            if (servers.length != 0) {
              async.forEach(servers, (item, callback) => {
                logger.debug(`Considerando servidor encontrado: ${item}`);
                socketClientServers.set(item.ip_server, require('socket.io-client')('http://' + item.ip_server + ':' + config.puerto_websocket_vms, {
                  reconnection: true,
                  reconnectionDelay: 0,
                  reconnectionDelay: 1000,
                }));
                logger.info(`servidor añadido "${item.ip_server}"`);

                const ipServer = item.ip_server;
                socketClientServers.get(item.ip_server).on('disconnect', () => {
                  pool.getConnection((err, connection) => {
                    connection.query(bloqueoTablas, (error, results, fields) => {
                      connection.query(`DELETE FROM Servidores WHERE ip_server='${ipServer}'`, (error, servers, fields) => {
                        connection.query('UNLOCK TABLES', (error, results, fields) => {
                          connection.release();
                        });
                        logger.info(`servidor desconectado`);
                        socketClientServers.get(item.ip_server).disconnect();
                        socketClientServers.delete(ipServer);
                      });
                    });
                  });
                });

                socketClientServers.get(ipServer).on('load', (data) => {
                  logger.info(`recibido load 154 "${JSON.stringify(data)}"`);
                  array.push(data);
                  let port = 0;
                  let puertosRestantes = puertos.difference(puertosUsados);
                  puertosRestantes = Array.from(puertosRestantes);
                  port = puertosRestantes[0];
                  puertosUsados.add(port);

                  setInterval(function () {
                    logger.info(`interval load 162 "${JSON.stringify(data)}"`);
                    if ((array[0].user == data.user) && (array[0].motivo == data.motivo)) {
                      clearInterval(this);
                      const comando = `/usr/bin/docker run --rm -e CHE_CONTAINER_PREFIX='ULLcloudIDE' \
                          -e CHE_WORKSPACE_AGENT_DEV_INACTIVE__STOP__TIMEOUT__MS=2592000000 \
                          -v /var/run/docker.sock:/var/run/docker.sock \
                          -v ${config.path_almacenamiento}${data.user}-${data.motivo}:/data \
                          -e CHE_PORT=${port} \
                          -e CHE_HOST=${addresses[0]} \
                          -e CHE_DOCKER_IP_EXTERNAL=${config.ip_server_exterior} \
                          --restart no \
                          eclipse/che:6.0.0-M4 start \
                          --skip:preflight \
                          `
                      logger.debug(`Invocamos: "${comando}"`);
                      exec(comando)
                        .then((result) => {
                          logger.debug(`Arranque contenedor salida estandar: "${result.stdout}"`);
                          functions.cleandockerimages();
                          array.shift();
                          logger.debug(`pasamos al siguiente`);
                          db.run(`INSERT INTO Asignaciones(usuario, motivo, puerto) VALUES(?,?,?)`, [data.user, data.motivo, port], (err) => {
                            if (err) {
                              return logger.info(`Error al insertar en Asiganciones: ${err.message}`);
                            }

                            const json = { user: data.user, motivo: data.motivo, puerto: port, };
                            socketClientServers.get(ipServer).emit('loaded', json);
                          });
                        })
                        .catch((error) => logger.warn(`Error Arranque contenedor: "${error}"`));
                    } else
                      logger.debug(`interval 162: no es nuestro usuario o motivo`);
                  }, 1000);
                });  // de on load

                socketClientServers.get(ipServer).on('stop', (data) => {
                  logger.info(`recibido stop 194 "${JSON.stringify(data)}"`);
                  array.push(data);
                  setInterval(function () {
                    logger.debug(`interval stop 197 "${JSON.stringify(data)}"`);
                    if ((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)) {
                      clearInterval(this);
                      const comando = `/usr/bin/docker stop ULLcloudIDE-${data.puerto}`
                      logger.debug(`Invocamos: "${comando}"`);
                      exec(comando)
                        .then((result) => {
                          logger.debug(`Parada contenedor salida estandar: "${result.stdout}"`);

                          functions.cleandockerimages();

                          //puertos.add(data.puerto);
                          puertosUsados.delete(data.puerto);
                          array.shift();
                          logger.info(`pasamos al siguiente`);
                          db.run(`DELETE FROM Asignaciones WHERE usuario=? AND motivo=? AND puerto=?`, [data.user, data.motivo, data.puerto], (err) => {
                            if (err) {
                              return logger.info(`Error al borrar de Asignaciones ${err.message}`);
                            }

                            const json = { user: data.user, motivo: data.motivo, puerto: data.puerto, };
                            socketClientServers.get(ipServer).emit('stopped', json);
                          });
                        })
                        .catch((error) => logger.warn(`Error Parada contenedor: "${error}"`));
                    }
                  }, 1000);
                });  // del on stop

                if (item == servers[servers.length - 1]) {
                  if (errores.length != 0) {
                    async.forEach(errores, (item, callback) => {
                      socketClientServers.values().next().value.emit('stopped', item);
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

//// FIN SERIALIZE

promesa.then(() => {
  setInterval(() => {
    pool.getConnection((err, connection) => {
      connection.query(bloqueoTablas, (error, results, fields) => {
        connection.query('SELECT * FROM Servidores AS s1', (error, servers, fields) => {
          connection.query('UNLOCK TABLES', (error, results, fields) => {
            connection.release();
          });
          logger.info(`buscando servidores...`);
          async.forEach(servers, (item, callback) => {

            if (socketClientServers.get(item.ip_server) == undefined) {
              const ipServer = item.ip_server;

              socketClientServers.set(ipServer, require('socket.io-client')('http://' + item.ip_server + ':' + config.puerto_websocket_vms, {
                reconnection: true,
                reconnectionDelay: 0,
                reconnectionDelay: 1000,
              }));

              socketClientServers.get(ipServer).on('disconnect', () => {
                pool.getConnection((err, connection) => {
                  connection.query(bloqueoTablas, (error, results, fields) => {
                    connection.query(`DELETE FROM Servidores WHERE ip_server='${ipServer}'`, (error, servers, fields) => {
                      connection.query('UNLOCK TABLES', (error, results, fields) => {
                        connection.release();
                      });
                      logger.info(`servidor desconectado ${ipServer}`);
                      socketClientServers.get(item.ip_server).disconnect();
                      socketClientServers.delete(ipServer);
                    });
                  });
                });
              });

              socketClientServers.get(ipServer).on('load', (data) => {
                logger.info(`recibido load 292 "${JSON.stringify(data)}"`);
                array.push(data);
                let port = 0;

                let puertosRestantes = puertos.difference(puertosUsados);
                puertosRestantes = Array.from(puertosRestantes);
                port = puertosRestantes[0];
                puertosUsados.add(port);

                setInterval(function () {
                  logger.info(`interval load 300 "${JSON.stringify(data)}"`);
                  if ((array[0].user == data.user) && (array[0].motivo == data.motivo)) {
                    clearInterval(this);
                    const comando = `/usr/bin/docker run --rm -e CHE_CONTAINER_PREFIX='ULLcloudIDE' \
                        -e CHE_WORKSPACE_AGENT_DEV_INACTIVE__STOP__TIMEOUT__MS=2592000000 \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v ${config.path_almacenamiento}${data.user}-${data.motivo}:/data \
                        -e CHE_PORT=${port} \
                        -e CHE_HOST=${addresses[0]} \
                        -e CHE_DOCKER_IP_EXTERNAL=${config.ip_server_exterior} \
                        --restart no \
                        eclipse/che:6.0.0-M4 start \
                        --skip:preflight \
                        `
                    logger.debug(`Invocamos: "${comando}"`);
                    exec(comando)
                      .then((result) => {
                        logger.debug(`Arranque contenedor salida estandar: "${result.stdout}"`);

                        functions.cleandockerimages();
                        array.shift();
                        logger.info(`pasamos al siguiente`);
                        db.run(`INSERT INTO Asignaciones(usuario, motivo, puerto) VALUES(?,?,?)`, [data.user, data.motivo, port], (err) => {
                          if (err) {
                            return logger.info(`Error al insertar en asignaciones: ${err.message}`);
                          }

                          const json = { user: data.user, motivo: data.motivo, puerto: port, };
                          socketClientServers.get(ipServer).emit('loaded', json);
                        });
                      })
                      .catch((error) => logger.warn(`Error arranque contenedor: "${error}"`));
                  }
                }, 1000);
              });  //de on load

              socketClientServers.get(ipServer).on('stop', (data) => {
                logger.info(`recibido stop 332 "${JSON.stringify(data)}"`);
                array.push(data);

                setInterval(function () {
                  logger.info(`interval stop 337 "${JSON.stringify(data)}"`);
                  if ((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)) {
                    clearInterval(this);
                    const comando = `/usr/bin/docker stop ULLcloudIDE-${data.puerto}`
                    logger.debug(`Invocamos: "${comando}"`);
                    exec(comando)
                      .then((result) => {
                        logger.debug(`Parada contenedor salida estandar: "${result.stdout}"`);

                        functions.cleandockerimages();

                        //puertos.add(data.puerto);
                        puertosUsados.delete(data.puerto);
                        array.shift();
                        logger.info(`pasamos al siguiente`);
                        db.run(`DELETE FROM Asignaciones WHERE usuario=? AND motivo=? AND puerto=?`, [data.user, data.motivo, data.puerto], (err) => {
                          if (err) {
                            return logger.info(`Error borrando de Asignaciones: ${err.message}`);
                          }

                          const json = { user: data.user, motivo: data.motivo, puerto: data.puerto, };
                          socketClientServers.get(ipServer).emit('stopped', json);
                        });
                      })
                      .catch((error) => logger.warn(`Error parada contenedor: "${error}"`));
                  }
                }, 1000);
              }); //del on stop
              logger.info(`Server añadido`);
            }

            if (item == servers[servers.length - 1]) {
              if (errores.length != 0) {
                async.forEach(errores, (item, callback) => {
                  socketClientServers.values().next().value.emit('stopped', item);
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

setInterval(() => {
  functions.cleandockerimages();
}, 900000);
