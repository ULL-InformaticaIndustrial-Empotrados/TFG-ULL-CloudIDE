
const functions = require('./functions.js');
async = require("async");

const lowEnd = 51;
const highEnd = 254;

const list = [];
for (let i = lowEnd; i <= highEnd; i++) {
    list.push(i);
}


const pool = functions.createnewconnection();

pool.getConnection(function(err, connection) {

  async.forEach(list, function(item, callback) {
    connection.query("INSERT INTO Banco_ip (ip_vm) VALUES ('10.6.134."+item+"')");

    //TODO corregir esto. Se debe usar callback de salida ya que pueden no
    //  ejecutarse en orden.
    if(item == list[list.length-1]){
      connection.release();
    }
  });
});
