const logger = require('./logger.js');

logger.info(`Comienza la aplicacion backend`);

const config = require('./config.json');
const functions = require('./functions.js');
const MySqlAsync = require('mysql');
const sqlite3 = require('sqlite3').verbose();

// TODO Poner la base de datos en otro sitio
const db = new sqlite3.Database(__dirname + 'cloudIDE.db');
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

Set.prototype.difference = (setB) => {
  const difference = new Set(this);
  for (let elem of setB) {
    difference.delete(elem);
  }

  return difference;
};

const puertos = new Set();
const aux = config.puerto_inicial;
for (let i = 0; i < config.numero_max_serverxuser * config.numero_max_users; i++) {
  puertos.add(aux);
  aux += 1;
}

const puertosUsados = new Set();
const errores = new Array();

const promesa = new Promise((resolve, reject) => {
  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS Asignaciones (usuario TEXT, motivo TEXT, puerto INTEGER)');

    db.all(`SELECT * FROM Asignaciones`, [], (err, rows) => {
      if (err) {
        throw err;
      }

      logger.info(`longitud de filas "${rows.length}"`);

      const promesaErrores = new Promise((resolve, reject) => {
        if (rows.length != 0) {
          rows.forEach((row) => {
            logger.info(`Puerto: "${row.puerto}"`);
            const exec = require('child_process').exec;
            const child = exec(__dirname + 'comprobarche.sh ' + config.rootpassword + ' ' + row.puerto,
              (error, stdout, stderr) => {
                if (error !== null) {
                  logger.warn(`Error comprobarche: "${error}"`);
                }

                logger.debug(`comprobarche salida estandar: "${stdout}"`);

                if (stdout == 'no existe\n') {
                  logger.info(`no tiene nada`);
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
            );
          });
        } else {
          resolve();
        }
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
                    logger.info(`recibido load "${JSON.stringify(data)}"`);
                    array.push(data);
                    let port = 0;
                    let puertosRestantes = puertos.difference(puertosUsados);
                    puertosRestantes = Array.from(puertosRestantes);
                    port = puertosRestantes[0];
                    puertosUsados.add(port);

                    setInterval(() => {
                      logger.info(`interval "${JSON.stringify(data)}"`);
                      if ((array[0].user == data.user) && (array[0].motivo == data.motivo)) {
                        clearInterval(this);
                        const exec = require('child_process').exec;
                        const child = exec(__dirname + 'script.sh 1 ' + data.user + '-' + data.motivo + ' ' + port + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
                          (error, stdout, stderr) => {
                            logger.debug(`script.sh 1 salida estandar: "${stdout}"`);
                            if (error !== null) {
                              logger.warn(`Error script.sh 1: "${error}"`);
                            }

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
                          }
                        );
                      }
                    }, 1000);
                  });  // de on load

                  socketClientServers.get(ipServer).on('stop', (data) => {
                    array.push(data);
                    setInterval(() => {
                      logger.debug(`interval stop "${JSON.stringify(data)}"`);
                      if ((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)) {
                        clearInterval(this);
                        const exec = require('child_process').exec;
                        const child = exec(__dirname + 'script.sh 0 ' + data.user + '-' + data.motivo + ' ' + data.puerto + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
                          (error, stdout, stderr) => {
                            logger.debug(`script.sh 0 salida estandar: "${stdout}"`);
                            if (error !== null) {
                              logger.warn(`Error script.sh 0: "${error}"`);
                            }

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
                          }
                        );
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
});

//// FIN SERIALIZE

// AFHC me quedo aquí

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
                logger.info(`recibido load "${JSON.stringify(data)}"`);
                array.push(data);
                let port = 0;

                let puertosRestantes = puertos.difference(puertosUsados);
                puertosRestantes = Array.from(puertosRestantes);
                port = puertosRestantes[0];
                puertosUsados.add(port);

                setInterval(() => {
                  logger.info(`interval "${JSON.stringify(data)}"`);
                  if ((array[0].user == data.user) && (array[0].motivo == data.motivo)) {
                    clearInterval(this);
                    const exec = require('child_process').exec;
                    const child = exec(__dirname + 'script.sh 1 ' + data.user + '-' + data.motivo + ' ' + port + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
                      (error, stdout, stderr) => {
                        logger.debug(`script.sh 1 salida estandar: "${stdout}"`);
                        if (error !== null) {
                          logger.warn(`Error script.sh 1: "${error}"`);
                        }

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
                      }
                    );
                  }
                }, 1000);
              });  //de on load

              socketClientServers.get(ipServer).on('stop', (data) => {
                array.push(data);

                setInterval(() => {
                  logger.info(`interval stop "${JSON.stringify(data)}"`);
                  if ((array[0].user == data.user) && (array[0].motivo == data.motivo) && (array[0].puerto == data.puerto)) {
                    clearInterval(this);
                    const exec = require('child_process').exec;
                    const child = exec(__dirname + 'script.sh 0 ' + data.user + '-' + data.motivo + ' ' + data.puerto + ' ' + config.rootpassword + ' ' + addresses[0] + ' ' + config.ip_server_exterior + ' ' + config.path_almacenamiento,
                      (error, stdout, stderr) => {
                        logger.debug(`script.sh 0 salida estandar: "${stdout}"`);
                        if (error !== null) {
                          logger.warn(`Error script.sh 0: "${error}"`);
                        }

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
                      }
                    );
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
