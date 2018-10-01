const logger = require(`winston`);

const myFormat = logger.format.printf(info => `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`);

logger.configure({
  format: logger.format.combine(
    logger.format.colorize(),
    logger.format.timestamp(),
    myFormat
  ),
  transports: [
    new logger.transports.Console({
      level: `warn`,
      silent: false,
    }),
    new logger.transports.File({
      filename: `/var/log/cloudideportal/portal.log`,
      level: `debug`,
    }),
  ],
});

module.exports = logger;
