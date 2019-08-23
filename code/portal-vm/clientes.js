
const mapUserSocket = new Map();


function broadcastClient(user, evento, data) {
  const socks = mapUserSocket.get(user);
  if (socks !== undefined) {
    socks.forEach((value) => {
      value.emit(evento, data);
    });
  }
}


module.exports = {
  mapUserSocket,
  broadcastClient,
};
