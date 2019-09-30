const url = require('url');
const http = require('http');
const https = require('https');

const parseXML = require('xml2js').parseString;
const XMLprocessors = require('xml2js/lib/processors');

const logger = require('./logger.js').child({ module: 'cas' });

/**
 * The CAS authentication types.
 * @enum {number}
 */
const AUTH_TYPE = {
  BOUNCE: 0,
  BOUNCE_REDIRECT: 1,
  BLOCK: 2,
};

/**
 * @typedef {Object} CAS_options
 * @property {string}  cas_url
 * @property {string}  service_url
 * @property {('1.0'|'2.0'|'3.0'|'saml1.1')} [cas_version='3.0']
 * @property {boolean} [renew=false]
 * @property {boolean} [is_dev_mode=false]
 * @property {string}  [dev_mode_user='']
 * @property {Object}  [dev_mode_info={}]
 * @property {string}  [session_name='cas_user']
 * @property {string}  [session_info=false]
 * @property {boolean} [destroy_session=false]
 */

/**
 * @param {CAS_options} options
 * @constructor
 */
function CASAuthentication(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('CAS Authentication was not given a valid configuration object.');
  }
  if (options.cas_url === undefined) {
    throw new Error('CAS Authentication requires a cas_url parameter.');
  }
  if (options.service_url === undefined) {
    throw new Error('CAS Authentication requires a service_url parameter.');
  }

  this.cas_version = options.cas_version !== undefined ? options.cas_version : '3.0';

  if (this.cas_version === '1.0') {
    this._validateUri = '/validate';
    this._validate = function validate(body, callback) {
      const lines = body.split('\n');
      if (lines[0] === 'yes' && lines.length >= 2) {
        return callback(null, lines[1]);
      }
      if (lines[0] === 'no') {
        return callback(new Error('CAS authentication failed.'));
      }

      return callback(new Error('Response from CAS server was bad.'));
    };
  } else if (this.cas_version === '2.0' || this.cas_version === '3.0') {
    this._validateUri = (this.cas_version === '2.0'
      ? '/serviceValidate' : '/p3/serviceValidate');
    this._validate = function validate2(body, callback) {
      parseXML(body, {
        trim: true,
        normalize: true,
        explicitArray: false,
        tagNameProcessors: [XMLprocessors.normalize, XMLprocessors.stripPrefix],
      }, (err, result) => {
        if (err) {
          return callback(new Error('Response from CAS server was bad.'));
        }
        try {
          const failure = result.serviceresponse.authenticationfailure;
          if (failure) {
            return callback(new Error(`CAS authentication failed (${failure.$.code}).`));
          }
          const success = result.serviceresponse.authenticationsuccess;
          if (success) {
            return callback(null, success.user, success.attributes);
          }

          return callback(new Error('CAS authentication failed.'));
        } catch (error) {
          logger.error(`CAS authentication failed: "${error}"`);
          return callback(new Error('CAS authentication failed.'));
        }
      });
    };
  } else if (this.cas_version === 'saml1.1') {
    this._validateUri = '/samlValidate';
    this._validate = function validate3(body, callback) {
      parseXML(body, {
        trim: true,
        normalize: true,
        explicitArray: false,
        tagNameProcessors: [XMLprocessors.normalize, XMLprocessors.stripPrefix],
      }, (err, result) => {
        if (err) {
          return callback(new Error('Response from CAS server was bad.'));
        }
        try {
          const samlResponse = result.envelope.body.response;
          const success = samlResponse.status.statuscode.$.Value.split(':')[1];
          if (success !== 'Success') {
            return callback(new Error(`CAS authentication failed (${success}).`));
          }

          const attributes = {};
          let attributesArray = samlResponse.assertion.attributestatement.attribute;
          if (!(attributesArray instanceof Array)) {
            attributesArray = [attributesArray];
          }
          attributesArray.forEach((attr) => {
            let thisAttrValue;
            if (attr.attributevalue instanceof Array) {
              thisAttrValue = [];
              attr.attributevalue.forEach((v) => {
                thisAttrValue.push(v._);
              });
            } else {
              thisAttrValue = attr.attributevalue._;
            }
            attributes[attr.$.AttributeName] = thisAttrValue;
          });
          return callback(null,
            samlResponse.assertion.authenticationstatement.subject.nameidentifier,
            attributes);
        } catch (error) {
          logger.error(`CAS authentication failed: "${error}"`);
          return callback(new Error('CAS authentication failed.'));
        }
      });
    };
  } else {
    throw new Error(`The supplied CAS version ("${this.cas_version}") is not supported.`);
  }

  this.cas_url = options.cas_url;
  const parsedCasUrl = url.parse(this.cas_url);
  this.request_client = parsedCasUrl.protocol === 'http:' ? http : https;
  this.cas_host = parsedCasUrl.hostname;
  this.cas_port = parsedCasUrl.protocol === 'http:' ? 80 : 443;
  this.cas_path = parsedCasUrl.pathname;

  this.service_url = options.service_url;

  this.renew = options.renew !== undefined ? !!options.renew : false;

  this.is_dev_mode = options.is_dev_mode !== undefined ? !!options.is_dev_mode : false;
  this.dev_mode_user = options.dev_mode_user !== undefined ? options.dev_mode_user : '';
  this.dev_mode_info = options.dev_mode_info !== undefined ? options.dev_mode_info : {};

  this.session_name = options.session_name !== undefined
    ? options.session_name : 'cas_user';
  this.session_info = ['2.0', '3.0', 'saml1.1'].indexOf(this.cas_version) >= 0
    && options.session_info !== undefined ? options.session_info : false;
  this.destroy_session = options.destroy_session !== undefined
    ? !!options.destroy_session : false;

  // Bind the prototype routing methods to this instance of CASAuthentication.
  this.bounce = this.bounce.bind(this);
  this.bounce_redirect = this.bounce_redirect.bind(this);
  this.block = this.block.bind(this);
  this.logout = this.logout.bind(this);
}

/**
 * Bounces a request with CAS authentication. If the user's session is not
 * already validated with CAS, their request will be redirected to the CAS
 * login page.
 */
CASAuthentication.prototype.bounce = function bounce(req, res, next) {
  // Handle the request with the bounce authorization type.
  this._handle(req, res, next, AUTH_TYPE.BOUNCE);
};

/**
 * Bounces a request with CAS authentication. If the user's session is not
 * already validated with CAS, their request will be redirected to the CAS
 * login page.
 */
CASAuthentication.prototype.bounce_redirect = function bounRedirect(req, res, next) {
  // Handle the request with the bounce authorization type.
  this._handle(req, res, next, AUTH_TYPE.BOUNCE_REDIRECT);
};

/**
 * Blocks a request with CAS authentication. If the user's session is not
 * already validated with CAS, they will receive a 401 response.
 */
CASAuthentication.prototype.block = function block(req, res, next) {
  // Handle the request with the block authorization type.
  this._handle(req, res, next, AUTH_TYPE.BLOCK);
};

/**
 * Handle a request with CAS authentication.
 */
CASAuthentication.prototype._handle = function handle(req, res, next, authType) {
  // If the session has been validated with CAS, no action is required.
  if (req.session[this.session_name]) {
    // If this is a bounce redirect, redirect the authenticated user.
    if (authType === AUTH_TYPE.BOUNCE_REDIRECT) {
      res.redirect(req.session.cas_return_to);
    } else {
      // Otherwise, allow them through to their request.
      next();
    }
  } else if (this.is_dev_mode) {
    // If dev mode is active, set the CAS user to the specified dev user.
    req.session[this.session_name] = this.dev_mode_user;
    req.session[this.session_info] = this.dev_mode_info;
    next();
  } else if (authType === AUTH_TYPE.BLOCK) {
    // If the authentication type is BLOCK, simply send a 401 response.
    res.sendStatus(401);
  } else if (req.query && req.query.ticket) {
    // If there is a CAS ticket in the query string, validate it with the CAS server.
    this._handleTicket(req, res, next);
  } else {
    // Otherwise, redirect the user to the CAS login.
    this._login(req, res, next);
  }
};

/**
 * Redirects the client to the CAS login.
 */
CASAuthentication.prototype._login = function login(req, res) {
  // Save the return URL in the session. If an explicit return URL is set as a
  // query parameter, use that. Otherwise, just use the URL from the request.
  req.session.cas_return_to = req.query.returnTo || url.parse(req.url).path;

  // Set up the query parameters.
  const query = {
    service: this.service_url + url.parse(req.url).pathname,
    // renew: this.renew
  };

  // Redirect to the CAS login.
  res.redirect(this.cas_url + url.format({
    pathname: '/login',
    query,
  }));
};

/**
 * Logout the currently logged in CAS user.
 */
CASAuthentication.prototype.logout = function logout(req, res, next) {
  if (req.session[this.session_name] !== undefined) {
    // Destroy the entire session if the option is set.
    if (this.destroy_session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error(`CAS destroy_session error: "${err}"`);
        }
      });
    } else {
      // Otherwise, just destroy the CAS session variables.
      delete req.session[this.session_name];
      if (this.session_info) {
        delete req.session[this.session_info];
      }
    }

    const query = {
      service: this.service_url + url.parse(req.url).pathname,
      // renew: this.renew
    };

    // Redirect the client to the CAS logout.
    res.redirect(this.cas_url + url.format({
      pathname: '/logout',
      query,
    }));
  } else {
    next();
  }
};

/**
 * Handles the ticket generated by the CAS login requester and validates it
 * with the CAS login acceptor.
 */
CASAuthentication.prototype._handleTicket = function handleTicket(req, res) {
  const requestOptions = {
    host: this.cas_host,
    port: this.cas_port,
  };
  let postData;
  if (['1.0', '2.0', '3.0'].indexOf(this.cas_version) >= 0) {
    requestOptions.method = 'GET';
    requestOptions.path = url.format({
      pathname: this.cas_path + this._validateUri,
      query: {
        service: this.service_url + url.parse(req.url).pathname,
        ticket: req.query.ticket,
      },
    });
  } else if (this.cas_version === 'saml1.1') {
    const now = new Date();
    postData = `<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Header/>
  <SOAP-ENV:Body>
    <samlp:Request xmlns:samlp="urn:oasis:names:tc:SAML:1.0:protocol" MajorVersion="1"
      MinorVersion="1" RequestID="_${req.host}.${now.getTime()}"
      IssueInstant="${now.toISOString()}">
      <samlp:AssertionArtifact>
        ${req.query.ticket}
      </samlp:AssertionArtifact>
    </samlp:Request>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

    requestOptions.method = 'POST';
    requestOptions.path = url.format({
      pathname: this.cas_path + this._validateUri,
      query: {
        TARGET: this.service_url + url.parse(req.url).pathname,
        ticket: '',
      },
    });
    requestOptions.headers = {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(postData),
    };
  }

  const request = this.request_client.request(requestOptions, (response) => {
    response.setEncoding('utf8');
    let body = '';
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      this._validate(body, (err, user, attributes) => {
        if (err) {
          logger.error(`CAS _validate error: "${err}"`);
          res.sendStatus(401);
        } else {
          req.session[this.session_name] = user;
          if (this.session_info) {
            req.session[this.session_info] = attributes || {};
          }
          res.redirect(req.session.cas_return_to);
        }
      });
    });
    response.on('error', (err) => {
      logger.error(`Response error from CAS:  "${err}"`);
      res.sendStatus(401);
    });
  });

  request.on('error', (err) => {
    logger.warn(`Request error with CAS: ${err}`);
    res.sendStatus(401);
  });

  if (this.cas_version === 'saml1.1') {
    request.write(postData);
  }
  request.end();
};

module.exports = CASAuthentication;
