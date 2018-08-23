const logger = require('winston');

const myFormat = logger.format.printf(info => {
  return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

logger.configure({
  format: logger.format.combine(
    logger.format.colorize(),
    logger.format.timestamp(),
    // logger.format.align(),
    myFormat
  ),
  transports: [
    new logger.transports.Console(),
  ],
  level: 'debug',
});


module.exports = logger;
