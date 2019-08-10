import logging
import ovirtsdk4 as sdk
import ovirtsdk4.types as types

import creds

def createconnection():

	connection = sdk.Connection(
	 url='https://iaas.ull.es/ovirt-engine/api',
	 username=creds.username,
	 password=creds.password,
	 ca_file='./ovirtpython/cert',
	 debug=True,
	 insecure=True,
	 timeout=30,
	 headers={'filter':True}
	 )

	print "Connection created"

	return connection
