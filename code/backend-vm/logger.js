const logger = require('winston');

const myFormat = logger.format.printf(info => `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`);

logger.configure({
  format: logger.format.combine(
    logger.format.colorize(),
    logger.format.timestamp(),
    // logger.format.align(),
    myFormat,
  ),
  transports: [
    new logger.transports.Console({
      level: 'warn',
      silent: false,
    }),
    new logger.transports.File({
      filename: '/var/log/cloudidebackend/backend.log',
      level: 'debug',
    }),
  ],
});


module.exports = logger;
