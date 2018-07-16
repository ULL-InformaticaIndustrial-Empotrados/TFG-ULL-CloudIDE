const os = require('os');
const config = require('./config.json');
const PythonShell = require('python-shell');

module.exports = {

  add_and_start_vm : function(name, ip_address, callback){

    const options = {
      mode: 'text',
      scriptPath: './ovirtpython',
      args: [name, ip_address]
    };

    PythonShell.run('add_and_start_vm.py', options, function (err, results) {
      if (err) throw err;
      // results is an array consisting of messages collected during execution
      console.log('results: %j', results);
      callback();
    });

  },

  stop_and_remove_vm : function(name, callback){

    const options = {
      mode: 'text',
      scriptPath: './ovirtpython',
      args: [name]
    };

    PythonShell.run('stop_and_remove_vm.py', options, function (err, results) {
      if (err) throw err;
      // results is an array consisting of messages collected during execution
      console.log('results: %j', results);
      callback();
    });

  },

}
