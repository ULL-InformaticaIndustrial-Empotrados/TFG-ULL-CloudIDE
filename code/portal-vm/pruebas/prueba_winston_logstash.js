const winston = require('winston');
const os = require("os");

//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
require('winston-logstash');

const myFormat = winston.format.printf(info => `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`);

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
    new winston.transports.Logstash({
      port: 28777,
      node_name: os.hostname(),
      host: '10.6.134.254',
      level: 'warn',
    }),
  ],
});



logger.error('This is a test error log message',
  { custom: 'my custom field', Environment: 'local' });

logger.error('Error principal');

logger.warn('warn desde principal');

const logger2 = logger.child({ label: 'hijo' });

logger2.warn('Warn desde hijo');

logger2.debug('Debug Desde hijo');
