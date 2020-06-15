const fetch = require('node-fetch');

async function arrancaWS(motivo, puerto) {
  console.log(`Se nos pide arrancar WS '${motivo}' en puerto ${puerto}`);
  const uriLista = `http://localhost:${puerto}/api/workspace?skipCount=0&maxItems=30`;
  console.log(`Uri Lista:'${uriLista}'`);
  const responseLista = await fetch(uriLista);
  const jsonLista = await responseLista.json();
  console.log(`Respuesta: ${JSON.stringify(jsonLista, null, 2)}`);

  for (const wsa of jsonLista) {
    console.log(`WS: ${wsa.config.name} → ${wsa.id}`);
  }

  const uriWS = `http://localhost:${puerto}/api/workspace/che%3A${motivo}?includeInternalServers=false`;
  console.log(`Uri WS:'${uriWS}'`);
  const responseWS = await fetch(uriWS);
  const jsonWS = await responseWS.json();
  console.log(`Respuesta: ${JSON.stringify(jsonWS, null, 2)}`);

  const { id } = jsonWS;
  if (id === undefined) {
    console.log(`No se consiguió id del WS '${motivo}'`);
    return false;
  }
  return true;
}

arrancaWS('informaticaindustrial', 8082)
  .then((resp) => {
    console.log(`Arranca Termió ${resp}`);
  });

