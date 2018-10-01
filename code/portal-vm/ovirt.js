const logger = require(`winston`);
const PythonShell = require(`python-shell`);

module.exports = {

  add_and_start_vm(name, ipAddress, callback) {
    const options = {
      mode: `text`,
      scriptPath: `./ovirtpython`,
      args: [name, ipAddress],
    };

    PythonShell.run(`add_and_start_vm.py`, options, (err, results) => {
      if (err) throw err;
      // results is an array consisting of messages collected during execution
      logger.debug(`add_and_start_vm.py results: "${results}"`);
      callback();
    });
  },

  stop_and_remove_vm(name, callback) {
    const options = {
      mode: `text`,
      scriptPath: `./ovirtpython`,
      args: [name],
    };

    PythonShell.run(`stop_and_remove_vm.py`, options, (err, results) => {
      if (err) throw err;
      // results is an array consisting of messages collected during execution
      logger.debug(`stop_and_remove_vm.py results: "${results}"`);
      callback();
    });
  },

};
