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
const websrv = require('./webserver.js');

firewall.inicializar(); // borramos iptables anteriores

const n = config.numero_max_serverxuser;
// const maxusers = config.numero_max_users;
sesion.createsession(app, cli.wsClient); // creamos la sesion

// //////////////////"/ Firewall

firewall.firewall();

//  ///////////////////



//WEBSOCKET////////////////////////////





////////////////////////////////////////
