const config = require('./config.json');
const mysql = require('mysql');

const connection = mysql.createConnection({
  host: config.host_bbdd_mysql,
  user: config.user_bbdd_mysql,
  password: config.password_bbdd_mysql,
  database : config.database_bbdd_mysql,
  acquireTimeout : 60 * 60 * 1000,
  connectTimeout : 60 * 60 * 1000,
  timeout : 60 * 60 * 1000,
  connectionLimit : 5,
  queueLimit : 0
});

if (process.argv.length < 3) {
  console.error('No se ha pasado nombre de usuario');
} else {
  const user = process.argv[2]
  const consulta = `INSERT INTO Profesores (usuario) VALUES ('${user}')`;
  console.log(`Consulta de inserción: "${consulta}"`);
  connection.connect();
  connection.query(consulta, (error, result, fields) => {
    if (error)
      console.log(`ERROR consulta: ${JSON.stringify(error, null, 2)}`);
    if (result)
      console.log(`RESULTADO consulta: ${JSON.stringify(result, null, 2)}`);
    if (fields)
      console.log(`FIELD consulta: ${JSON.stringify(fields, null, 2)}`);
  });
  connection.end();
}
