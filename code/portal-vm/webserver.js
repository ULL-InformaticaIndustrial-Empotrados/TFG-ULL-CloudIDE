const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');

const logger = require('./logger.js').child({ label: 'websrv' });

logger.info('Comienza modulo webserver.js');

const config = require('./config.json');
const functions = require('./functions.js');
const db = require('./database.js');
const vms = require('./vms.js');
const serv = require('./servidores.js');
const firewall = require('./firewall.js');
const cli = require('./clientes.js');
const sesion = require('./sesion.js');


// AUTENTICACION POR CAS ULL
const CASAuthentication = require('./cas-authentication.js');

// Create a new instance of CASAuthentication.
const cas = new CASAuthentication({
  cas_url: 'https://login.ull.es/cas-1',
  service_url: 'http://cloudide.iaas.ull.es',
  session_info: 'cas_userinfo',
  destroy_session: false,
});


const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/cloud', express.static('./client/views'));
app.use('/', express.static('./client/views'));

app.set('views', './client/views'); // Configuramos el directorio de vistas
app.set('view engine', 'ejs');

sesion.createsession(app, cli.wsClient); // creamos la sesion

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

// Funcion añade usuarios a un servicio en las tablas de la BD
// Recibe conexion con las tablas bloqueadas.
async function aniadeUsuarioServicio(conexion, usuarios, servicio) {
  let valores = usuarios;
  if (!(valores instanceof Array)) {
    valores = [valores];
  }
  for (const item of valores) {
    const aux = item.match(palabraInicial);

    await conexion.query(`INSERT INTO Matriculados (usuario, motivo)
      SELECT '${aux}','${servicio}' FROM dual WHERE NOT EXISTS (
        SELECT * FROM Matriculados as m1 WHERE usuario='${aux}'
        AND motivo='${servicio}')`);
    await conexion.query(`INSERT INTO Ultima_conexion (usuario, motivo)
      SELECT '${aux}','${servicio}' FROM dual WHERE NOT EXISTS (
        SELECT * FROM Ultima_conexion as uc WHERE usuario='${aux}'
        AND motivo='${servicio}')`);
    await conexion.query(`DELETE FROM Eliminar_servicio_usuario
      WHERE usuario='${aux}' AND motivo='${servicio}'`);
  }
}

// Funcion para mansar parar un usuario-servicio
// Se pasa conexión y resultado query sobre tabla Asignaciones
async function mandaParar(conexion, asignacion) {
  const { usuario, motivo, puerto } = asignacion;
  const ipVM = vms.mapIpVMS.get(asignacion.ip_vm);
  if (ipVM === undefined) {
    logger.error(`En 'mandaParar' no hay IP para '${usuario}'-'${motivo}'`);
    return;
  }
  const socketVM = vms.getSocketFromIP(ipVM);
  await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
    VALUES ('${asignacion.ip_vm}', '${motivo}','${usuario}', 'down')`);
  const json = { user: usuario, motivo, puerto };
  socketVM.emit('stop', json);
  logger.info(`Enviado stop ${JSON.stringify(json)} a ${ipVM}`);
}

app.get('/', async (req, res) => {
  // logger.debug(`GET / req: ${util.inspect(req)}`);
  const ipOrigen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user === undefined) {
    serv.broadcastServers('deletednat', ipOrigen);
    await firewall.deletednat(ipOrigen);
    let conexion;
    try {
      const pool = await db.pool;
      conexion = await pool.getConnection();
      await conexion.query(`DELETE FROM Firewall
        WHERE ip_origen='${functions.cleanAddress(req.connection.remoteAddress)}'`);
      await conexion.release();
    } catch (err) {
      logger.error(`Al borrar de tabla Firewall: ${err}`);
    }
    res.render('index', {});
  } else if (ipOrigen !== req.session.ip_origen) {
    logger.info(`IP logueo ${ipOrigen} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
  } else {
    res.redirect('/controlpanel');
  }
});


app.get('/controlpanel', async (req, res) => {
  const ipOrigen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ipOrigen !== req.session.ip_origen) {
    logger.info(`IP logueo ${ipOrigen} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }
  const { user, rol } = req.session;
  logger.info(`El usuario ${user} accede a /controlpanel'`);
  let conexion;
  let destino = 'controlpanelalumno';
  let data = {};
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

    data = {
      ip_server_che: config.ip_server_exterior,
      user,
      encendidos: upped,
      apagandose: dowing,
      encendiendose: upping,
      resto: rest,
    };

    if (rol === 'profesor') {
      const motivos = await conexion.query(`SELECT motivo FROM Servicios
        WHERE usuario='${user}' AND motivo NOT IN
        (SELECT motivo FROM Eliminar_servicio)`);
      logger.info(`Usuario ${user} es profesor con ${motivos.length} servicios`);
      const tservicios = [];
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
          } else {
            usuarios.push({
              usuario: ua.usuario,
              estado: 'down',
              fecha: ua.fecha,
            });
          }
        }
        tservicios.push({ motivo, usuarios });
      }
      destino = 'controlpanelprofesor';
      data.servicios = tservicios;
    }
  } catch (err) {
    logger.error(`Error al tratar /controlpanel: ${err}`);
  }
  if (conexion) await conexion.release();
  res.render(destino, data);
});

app.get('/cloud/:motivo', async (req, res) => {
  const ipOrigen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ipOrigen !== req.session.ip_origen) {
    logger.info(`IP logueo ${ipOrigen} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }
  const { user } = req.session;
  const { motivo } = req.params;
  let destino = 'error';
  let data = {};
  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    const row = await conexion.query(`SELECT * FROM Asignaciones
      WHERE usuario='${user}' AND motivo='${motivo}'`);
    if (row.length > 0) {
      await conexion.query(`UPDATE Ultima_conexion
        SET fecha='${functions.dateFormat()}'
        WHERE usuario='${user}' AND motivo='${motivo}'`);
      destino = 'cloud';
      data = {
        user,
        motivo,
        ip_server_che: config.ip_server_exterior,
        port_server_che: row[0].puerto,
      };
    }
  } catch (err) {
    logger.error(`Error al trtar /cloud:${motivo}`);
  }
  if (conexion) await conexion.release();
  res.render(destino, data);
});

app.get('/autenticacion', cas.bounce, async (req, res) => {
  const ipOrigen = functions.cleanAddress(req.connection.remoteAddress);
  if (req.session.user === undefined) {
    res.redirect('/');
    return;
  }
  if (ipOrigen !== req.session.ip_origen) {
    logger.info(`IP logueo ${ipOrigen} != de la de sesión ${req.session.ip_origen}`);
    res.redirect('/logout');
    return;
  }

  // borrar iptables de esta ip por si acaso
  serv.broadcastServers('deletednat', ipOrigen);
  await firewall.deletednat(ipOrigen);
  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ipOrigen}'`);

    const user = req.session.cas_userinfo.username;
    req.session.user = user;
    req.session.ip_origen = ipOrigen;
    const rol = await getRoll(user);
    req.session.rol = rol;
    logger.info(`Usuario ${user} considerado ${rol}`);
    await conexion.query(`INSERT INTO Firewall (usuario, ipOrigen)
      VALUES ('${user}','${ipOrigen}')`);

    // Actualizamos iptables
    const asignasUser = await conexion.query(`SELECT ip_vm, puerto FROM Asignaciones
      WHERE usuario='${user}'`);
    await conexion.release();
    if (asignasUser.length > 0) {
      const asigIni = asignasUser[0]; // Primera asignación
      // TODO esto debería ser objeto, no string
      serv.broadcastServers('añadircomienzo', `${ipOrigen} ${asigIni.ip_vm} ${asigIni.puerto}`);
      await firewall.dnatae('añadircomienzo', ipOrigen, asigIni.ip_vm, 0);
      for (const asigA of asignasUser) {
        // TODO esto debería ser objeto, no string
        serv.broadcastServers('añadirsolo', `${ipOrigen} ${asigA.ip_vm} ${asigA.puerto}`);
        await firewall.dnatae('añadirsolo', ipOrigen, asigA.ip_vm, asigA.puerto);
      }
    }
  } catch (err) {
    logger.error(`Error al tratar /autenticacion: ${err}`);
  }
  setTimeout(() => {
    res.redirect('/controlpanel');
  }, 3000);
});

app.get('/logout', cas.logout, async (req, res) => {
  const ipOrigen = functions.cleanAddress(req.connection.remoteAddress);

  await firewall.tcpkillestablished(ipOrigen);

  const { user } = req.session;

  req.session.user = undefined;
  req.session.ip_origen = undefined;
  req.session.destroy();

  serv.broadcastServers('deletednat', ipOrigen);
  await firewall.deletednat(ipOrigen);
  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(`DELETE FROM Firewall WHERE ip_origen='${ipOrigen}'`);
    conexion.release();
  } catch (err) {
    logger.error(`Error al tratar /logout: ${err}`);
  }
  setTimeout(() => {
    if (cli.mapUserSocket.get(user) !== undefined) {
      cli.broadcastClient(user, 'reload', '');
    }
    res.redirect('/');
  }, 4000);
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
  let conexion;
  const datos = {};
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    const existeServicio = (await conexion.query(`SELECT count(*) AS total FROM
      Servicios WHERE motivo='${req.query.nombre}'`))[0].total > 0;
    datos.valido = !existeServicio;
    await conexion.release();
  } catch (err) {
    logger.error(`Error al trtar /comprobardisponibilidad: ${err}`);
  }
  res.send(datos);
});


app.post('/nuevoservicio', async (req, res) => {
  if (req.session.user === undefined) {
    logger.warn('No hay user invocando /nuevoservicio');
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn('No es profesor invocando /nuevoservicio');
    return;
  }
  const nombServi = functions.getCleanedString(req.body.nombreservicio);
  req.body.nombreservicio = nombServi;
  let conexion;
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
    const usuarios = req.body.usuario;
    if (usuarios === undefined) {
      logger.info(`No se indicaron usuarios al crear servicio ${nombServi}`);
    } else {
      aniadeUsuarioServicio(conexion, usuarios, nombServi);
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
    logger.warn('No hay user invocando /eliminarservicio');
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn('No es profesor invocando /eliminarservicio');
    return;
  }
  const nombServi = functions.getCleanedString(req.body.nombreservicio);
  req.body.nombreservicio = nombServi;
  let conexion;
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
        if (estaasignado.length <= 0) {
          logger.debug(`Eliminando '${usuario}'-'${nombServi}': no está encendido`);
          vms.compruebaEliminarServicioUsuario(conexion, nombServi, usuario);
        } else {
          logger.debug(`Eliminando '${usuario}'-'${nombServi}': está encendido`);
          const ipVM = vms.mapIpVMS.get(estaasignado[0].ip_vm);
          if (ipVM === undefined) {
            logger.warn(`No hay IP para asignación de '${usuario}'-'${nombServi}'`);
          } else {
            const socketVM = vms.getSocketFromIP(estaasignado[0].ip_vm);
            await conexion.query(`INSERT INTO Pendientes (ip_vm, motivo, usuario, tipo)
              VALUES ('${estaasignado[0].ip_vm}', '${nombServi}','${usuario}', 'down')`);
            const json = { user: usuario, motivo: nombServi, puerto: estaasignado[0].puerto };
            socketVM.emit('stop', json);
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


app.post('/aniadirusuarios', async (req, res) => {
  if (req.session.user === undefined) {
    logger.warn('No hay user invocando /eliminarservicio');
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn('No es \'profesor\' invocando /eliminarservicio');
    return;
  }
  const nombServi = functions.getCleanedString(req.body.nombreservicio);
  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);

    const totServi = (await conexion.query(`SELECT count(*) AS total FROM Servicios as s1
      WHERE motivo='${nombServi}' AND usuario='${req.session.user}'`))[0].total;
    if (totServi <= 0) {
      throw new Condicion(`El servicio ${nombServi} no existe para usuario ${req.session.user}`);
    }
    const elimServi = (await conexion.query(`SELECT count(*) AS total
      FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`))[0].total;
    if (elimServi > 0) {
      throw new Condicion(`El servicio ${nombServi} ya se está eliminando`);
    }
    const usuarios = req.body.usuario;
    if (usuarios === undefined) {
      throw new Condicion('No se han indicado usuarios a añadir');
    }
    aniadeUsuarioServicio(conexion, usuarios, nombServi);
  } catch (err) {
    if (err instanceof Condicion) {
      logger.info(err.msg);
    } else {
      logger.warn(`Error en '/aniadirusuarios': ${err}`);
    }
  }
  if (conexion !== undefined) {
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  }
  res.redirect('/controlpanel');
});


app.post('/eliminarusuarios', async (req, res) => {
  if (req.session.user === undefined) {
    logger.warn('No hay user invocando /eliminarusuarios');
    return;
  }
  if (req.session.rol !== 'profesor') {
    logger.warn('No es \'profesor\' invocando /eliminarusuarios');
    return;
  }
  const nombServi = functions.getCleanedString(req.body.nombreservicio);
  let conexion;
  try {
    const pool = await db.pool;
    conexion = await pool.getConnection();
    await conexion.query(db.bloqueoTablas);

    const totServi = (await conexion.query(`SELECT count(*) AS total FROM Servicios as s1
      WHERE motivo='${nombServi}' AND usuario='${req.session.user}'`))[0].total;
    if (totServi <= 0) {
      throw new Condicion(`El servicio ${nombServi} no existe para usuario ${req.session.user}`);
    }
    const elimServi = (await conexion.query(`SELECT count(*) AS total
      FROM Eliminar_servicio as es WHERE motivo='${nombServi}'`))[0].total;
    if (elimServi > 0) {
      throw new Condicion(`El servicio ${nombServi} ya se está eliminando`);
    }
    const usuarios = req.body.usuario;
    if (usuarios === undefined) {
      throw new Condicion('No se han indicado usuarios a eliminar');
    }
    let valores = usuarios;
    if (!(valores instanceof Array)) {
      valores = [valores];
    }
    for (const item of valores) {
      const aux = item.match(palabraInicial);

      const estaMat = (await conexion.query(`SELECT count(*) AS total FROM Matriculados as m1
        WHERE motivo='${nombServi}' AND usuario='${aux}'`))[0].total > 0;
      if (!estaMat) {
        logger.info(`El usuario ${aux} pasado para borrar no está matriculado`);
      } else {
        const eliminando = (await conexion.query(`SELECT count(*) AS total FROM Eliminar_servicio_usuario as esu
          WHERE motivo='${nombServi}' AND usuario='${aux}'`))[0].total > 0;
        if (eliminando) {
          logger.info(`El usuario ${aux} pasado para borrar ya se está eliminando`);
        } else {
          await conexion.query(`INSERT INTO Eliminar_servicio_usuario (usuario, motivo)
            SELECT '${aux}','${nombServi}' FROM dual WHERE NOT EXISTS (
              SELECT * FROM Eliminar_servicio_usuario as esu
              WHERE usuario='${aux}' AND motivo='${nombServi}')`);
          const estaPendiente = (await conexion.query(`SELECT count(*) AS total FROM Pendientes as p1
            WHERE motivo='${nombServi}' AND usuario='${aux}'`))[0].total > 0;
          if (!estaPendiente) {
            await conexion.query(`DELETE FROM Cola WHERE usuario='${aux}' AND motivo='${nombServi}'`);
            const estaasignado = await conexion.query(`SELECT * FROM Asignaciones as a1
              WHERE motivo='${nombServi}' AND usuario='${aux}'`);
            if (estaasignado.length <= 0) {
              logger.debug(`Eliminando '${aux}'-'${nombServi}': no está encendido`);
              vms.compruebaEliminarServicioUsuario(conexion, nombServi, aux);
            } else {
              logger.debug(`Eliminando '${aux}'-'${nombServi}': está encendido`);
              await mandaParar(conexion, estaasignado[0]);
            }
          } else {
            // TODO Faltaría el caso cuando está pendiente ¿?
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Condicion) {
      logger.info(err.msg);
    } else {
      logger.warn(`Error en '/eliminarusuarios': ${err}`);
    }
  }
  if (conexion !== undefined) {
    await conexion.query('UNLOCK TABLES');
    await conexion.release();
  }
  res.redirect('/controlpanel');
});

app.get('*', (req, res) => {
  res.render('error', {});
});

app.listen(config.puerto_server, () => {
  logger.info(`Servidor web escuchando en el puerto ${config.puerto_server}`);
});
