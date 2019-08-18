const winston = require('winston');

const myFormat = winston.format.printf(info =>
  `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`
);

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    myFormat,
  ),
  transports: [
    new winston.transports.Console({
      level: 'debug', // warn
      silent: false,
    }),
    new winston.transports.File({
      filename: '/var/log/cloudideportal/portal.log',
      level: 'debug',
    }),
  ],

});

module.exports = logger;
