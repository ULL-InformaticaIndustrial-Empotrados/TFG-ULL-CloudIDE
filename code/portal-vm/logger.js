const winston = require('winston');

const myFormat = winston.format.printf(info => `${info.timestamp} [${info.module}] ${info.level}: ${info.message}`);

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: (process.env.NODE_ENV !== 'production') ? 'debug' : 'warn',
      silent: false,
      format: (process.env.NODE_ENV !== 'production') ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        myFormat,
      ) : winston.format.combine(
        winston.format.timestamp(),
        myFormat,
      ),
    }),
    new winston.transports.File({
      filename: '/var/log/cloudideportal/portal.log',
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        myFormat,
      ),
    }),
    new winston.transports.File({
      filename: '/var/log/winston-portal.log',
      level: 'info',
      format: winston.format.combine(
        // winston.format.label({ mod: 'm1', message: true }),
        // winston.format.timestamp(),
        // winston.format.prettyPrint(),
        winston.format.timestamp(),
        winston.format.logstash(),
      ),
    }),
  ],

});

module.exports = logger;
