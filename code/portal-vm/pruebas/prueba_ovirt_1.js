const logger = require('../logger.js').child({ label: 'prueba_ovirt_1' });

const ovirt = require('../ovirt.js');

async function main() {
  logger.info('Empieza prueba_ovirt_1');
  const ovr = new ovirt.Ovirt();

  await ovr.ajustaVMArrancadas();

  await ovr.pool.end();

  logger.info('Termina prueba_ovirt_1');
}

main();
