const CREDS = require('./creds');

const mysql = require(`promise-mysql`);
const sqlite3 = require(`sqlite-async`);

const io = require(`socket.io-client`);

const { exec } = require(`child-process-promise`);

const logger = require(`./logger.js`);

logger.info(`Comienza la aplicacion backend`);

const config = require(`./config.json`);
const functions = require(`./functions.js`);

let db3; // Contendrá la BD una vez abierta


const socketClientServers = new Map();

const addresses = functions.getiplocal();
logger.debug(`Dirección: "${addresses[0]}"`);

functions.cleandockerimages();

const pool = mysql.createPool({
  host: config.host_bbdd_mysql,
  user: CREDS.user_bbdd_mysql,
  password: CREDS.password_bbdd_mysql,
  database: config.database_bbdd_mysql,

  // debug : true,

  acquireTimeout: 60 * 60 * 1000,
  connectTimeout: 60 * 60 * 1000,
  connectionLimit: 1,
  queueLimit: 0,
});

logger.debug(`Creado pool de conexiones MySQL`);

pool.on(`release`, (connection) => {
  logger.debug(`Connection ${connection.threadId} released`);
});


// Añadimos el método diferencia de conjunto
Set.prototype.difference = function (setB) {
  const difference = new Set(this);
  for (const elem of setB) {
    difference.delete(elem);
  }

  return difference;
};

// Creamos conjunto de puertos y lo rellenamos
const puertos = new Set();
let aux = config.puerto_inicial;
for (let i = 0; i < config.numero_max_serverxuser * config.numero_max_users; i += 1) {
  puertos.add(aux);
  aux += 1;
}

const puertosUsados = new Set();
let errores = [];


// FUNCIONES AUXILIARES  /////////////////////////////////////

// Devuelve promesa para creación de servidor Che
function arrancaChe(user, motivo, port) {
  const comando = `/usr/bin/docker run --rm -e CHE_CONTAINER_PREFIX='ULLcloudIDE' \
      -e CHE_WORKSPACE_AGENT_DEV_INACTIVE__STOP__TIMEOUT__MS=2592000000 \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v ${config.path_almacenamiento}${user}-${motivo}:/data \
      -e CHE_PORT=${port} \
      -e CHE_HOST=${addresses[0]} \
      -e CHE_DOCKER_IP_EXTERNAL=${config.ip_server_exterior} \
      --restart no \
      eclipse/che:${config.cheversion} start \
      --skip:preflight \
      `;
  logger.debug(`Preparamos: "${comando}"`);
  return exec(comando)
  .then((result) => {
    logger.debug(`Arranque contenedor salida estandar: "${result.stdout}"`);
  })
  .catch(error => logger.warn(`Error Arranque contenedor: "${error}"`));
}


// Devuelve promesa para la parada del servidor Che
function paraChe(port) {
  const comando = `/usr/bin/docker stop ULLcloudIDE-${port}`;
  logger.debug(`Preparamos comando parada che: "${comando}"`);
  return exec(comando)
  .then((result) => {
    logger.debug(`Parada contenedor salida estandar: "${result.stdout}"`);
  });
}

// Configura servidor  //////////////////////////

// Cola de promesas para atender a los `load` secuencialmente
let colaLoad = Promise.resolve();
// Cola de promesas para atender a los `stop` secuencialmente
let colaStop = Promise.resolve();

function configuraServidor(item) {
  const ipServer = item.ip_server;
  return new Promise((resolve) => {
    logger.debug(`Considerando servidor: ${ipServer}`);
    if (socketClientServers.get(ipServer) !== undefined) {
      logger.debug(`servidor ${ipServer} ya configurado`);
      resolve();
      return;
    }
    const socket = io.connect(`http://${ipServer}:${config.puerto_websocket_vms}`, {
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketClientServers.set(ipServer, socket);

    socket.on(`disconnect`, () => {
      logger.info(`servidor ${ipServer} desconectado`);
      pool.query(`DELETE FROM Servidores WHERE ip_server='${ipServer}'`)
      .then(() => {
        logger.info(`servidor ${ipServer} borrado de la BD`);
        socket.disconnect();
        socketClientServers.delete(ipServer);
      })
      .catch((error) => {
        logger.warn(`Error al borrar servidor ${ipServer} de la BD:"${error}"`);
      });
    });

    socket.on(`load`, (data) => {
      logger.info(`recibido load de ${ipServer} "${JSON.stringify(data)}"`);
      let port = 0;
      let puertosRestantes = puertos.difference(puertosUsados);
      puertosRestantes = Array.from(puertosRestantes);
      [port] = puertosRestantes;
      puertosUsados.add(port);

      colaLoad = colaLoad.then(() => {
        logger.info(`Ejecutando load "${JSON.stringify(data)}"`);
        return arrancaChe(data.user, data.motivo, port)
        .then(() => {
          logger.debug(`Arrancado docker para ${data.user}-${data.motivo}`);
        })
        .then(() => {
          functions.cleandockerimages();
          logger.debug(`Informamos al servidor ${ipServer}`);
          const json = { user: data.user, motivo: data.motivo, puerto: port };
          socketClientServers.get(ipServer).emit(`loaded`, json);
          const consulta = `INSERT INTO Asignaciones(usuario, motivo, puerto)
            VALUES('${data.user}', '${data.motivo}', ${port})`;
          logger.debug(`Guardamos en Asignaciones con "${consulta}"`);
          db3.run(consulta)
          .then(() => {
            logger.debug(`Guardado en Asignaciones (${data.user},${data.motivo}, ${port})`);
          })
          .catch((error) => {
            logger.warn(`Error al insertar en Asiganciones: "${error}"`);
          });
        });
      });
    }); // de on load

    socket.on(`stop`, (data) => {
      logger.info(`recibido stop "${JSON.stringify(data)}"`);
      colaStop = colaStop.then(() => {
        logger.debug(`Ejecutando stop "${JSON.stringify(data)}"`);
        return paraChe(data.puerto)
        .then(() => {
          logger.debug(`Parado docker ${data.puerto}`);
          functions.cleandockerimages();

          // puertos.add(data.puerto);
          puertosUsados.delete(data.puerto);
          db3.run(`DELETE FROM Asignaciones
            WHERE usuario='${data.user}' AND motivo='${data.motivo}' AND puerto=${data.puerto}`)
          .then(() => {
            logger.debug(`Borrado en Asignaciones (${data.user},${data.motivo}, ${data.puerto})`);
          })
          .catch((err) => {
            logger.warn(`Error al borrar de Asignaciones "${err.message}"`);
          });

          const json = { user: data.user, motivo: data.motivo, puerto: data.puerto };
          socket.emit(`stopped`, json);
        })
        .catch(error => logger.warn(`Error Parada contenedor ${data.puerto}: "${error}"`));
      });
    }); // del on stop
    logger.info(`Servidor ${ipServer} configurado`);
    resolve();
  });
}

// Funcion-promesa que comprueba si asignación existe

function compruebaAsignacion(row) {
  logger.info(`Comprobando puerto: "${row.puerto}"`);
  const comando = `/usr/bin/docker ps -qf "name=ULLcloudIDE-${row.puerto}"`;
  logger.debug(`Ejecutando comando "${comando}"`);
  return exec(comando)
  .then((result) => {
    logger.debug(`Comprobar puerto salida estandar: "${result.stdout}"`);

    if (result.stdout === ``) {
      logger.info(`El servidor en puerto ${row.puerto} no tiene nada`);
      errores.push({ motivo: row.motivo, user: row.usuario, puerto: row.puerto });
      db3.run(`DELETE FROM Asignaciones WHERE puerto=${row.puerto}`)
      .then(() => {
        logger.debug(`Borrada asignación de puerto ${row.puerto}`);
      })
      .catch((err) => {
        logger.warn(`Error al borrar la asignación inicial ${row.puerto}: "${err}"`);
      });
    } else {
      logger.info(`si que existe Asignación: ${result.stdout}`);
      puertosUsados.add(row.puerto);
    }
  })
  .catch((err) => {
    logger.warn(`Error comprobando puerto ${row.puerto}: "${err}"`);
  });
}

// Funcion para comprobar los servidores existentes

function compruebaServidores() {
  logger.debug(`Comprobando servidores`);
  pool.query(`SELECT * FROM Servidores AS s1`)
  .then((servers) => {
    logger.info(`Hay ${servers.length} servidores...`);
    Promise.all(servers.map(configuraServidor))
    .then(() => {
      for (const error of errores) {
        for (const [srv, sckt] of socketClientServers) {
          sckt.emit(`stopped`, error);
          logger.info(`enviado a ${srv} stop "${JSON.stringify(error)}"`);
        }
      }
      errores = [];
    });
  });
}

// ////////////////////////////////////////////////////
function inicializacion() {
  // limpiamos ids de docker que hayan podido quedarse y que no estén ejecutandose
  const comando = `/usr/bin/docker rm $(/usr/bin/docker ps -aq) &>/dev/null`;
  logger.debug(`Limpiando ids Docker comando "${comando}"`);
  exec(comando)
  .catch(err => logger.warn(`Error limpiando IDs: "${err}"`));

  logger.debug(`Miramos asignaciones que puedan quedar de ejecuciones anteriores`);
  return db3.run(`CREATE TABLE IF NOT EXISTS Asignaciones
    (usuario TEXT, motivo TEXT, puerto INTEGER)`)
  .then(() => db3.all(`SELECT * FROM Asignaciones`))
  .then((rows) => {
    logger.info(`longitud de filas Asignaciones "${rows.length}"`);
    Promise.all(rows.map(compruebaAsignacion))
    .then(compruebaServidores);
  });
}

sqlite3.open(`${config.path_db}cloudIDE.db`)
.then((db) => {
  db3 = db;
  logger.debug(`Tenemos la BD sqlite3`);
  db3.db.serialize(); // Ponemos queris en modo serializado
})
.then(() => {
  if (db3 === undefined) {
    logger.debug(`db3 esta indefinido`);
  }
  inicializacion().then(() => {
    setInterval(compruebaServidores, config.tiempo_actualizacion);
  });
})
.catch(err => logger.warn(`Error en la inicialización: "${err}"`));


setInterval(() => {
  functions.cleandockerimages();
}, 900000);
