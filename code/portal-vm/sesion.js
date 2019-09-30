const session = require('express-session');
const redis = require('redis');
const socketIOSession = require('socket.io.session');
const RedisStore = require('connect-redis')(session);

const logger = require('./logger.js').child({ module: 'sesion' });

const config = require('./config.json');

module.exports = {

  createsession(app, websocketClient) {
    const client = redis.createClient(6379, config.host_redis);

    client.on('connect', () => {
      logger.info('redis conected');
    });


    const sessionStore = new RedisStore({
      client,
      host: config.host_redis,
      port: 6379,
    });

    const sessionSettings = {
      secret: 'my-secret',
      resave: true,
      saveUninitialized: true,
      store: sessionStore,
      /* cookie : {
        expires: new Date(253402300000000),
        maxAge: 253402300000000
    } */

    };

    const socketSession = socketIOSession(sessionSettings);

    app.use(session(sessionSettings));
    websocketClient.use(socketSession.parser);
  },

};
