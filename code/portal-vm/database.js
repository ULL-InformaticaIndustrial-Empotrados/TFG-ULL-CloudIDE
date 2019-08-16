const mysql = require('promise-mysql');
const CREDS = require('./creds');
const config = require('./config.json');
const logger = require('./logger.js');

module.exports = {
  async creaPool() {
    const pool = await mysql.createPool({
      host: config.host_bbdd_mysql,
      user: CREDS.user_bbdd_mysql,
      password: CREDS.password_bbdd_mysql,
      database: config.database_bbdd_mysql,
      // debug : true,
      acquireTimeout: 60 * 60 * 1000,
      connectTimeout: 60 * 60 * 1000,
      timeout: 60 * 60 * 1000,
      connectionLimit: 5,
      queueLimit: 0,
    });

    logger.debug('creado Pool conexiones MySQL');

    pool.on('release', (connection) => {
      logger.debug(`Connection MySQL "${connection.threadId}" released`);
    });

    return pool;
  },

};
