# Examples

This directory contains a simple example of a server and a client.
The server opens up an http server listening on port 3000
and an rpc-server listening on port 12345.

## Normal server

The client connects to a http-server via the url passed in as a parameter,
and gets an ip-address, a port, a fingerprint and a token back.
This information allows it to setup an authenticated rpc-session towards the
server.

In a production setup, the http-server should be replaced with an https-server
with a properly signed certificate.
This allows the client to verify that it is talking to the correct server.
The client should also present some sort of credentials to allow the
server to authenticate the client.

### Server output

    $ node server.js
    http server listening on http://localhost:3000
    Server received { test: 1 }
    closed without error

## Client output

    $ node client.js http://localhost:3000
    Fingerprint 67:B1:46:54:C5:EE:8A:51:F1:63:FA:88:DA:DC:3E:39:36:1F:86:62
    Token 11b19626-6f7a-4c64-a2fd-abca8b713352
    Client received { test: 'back' }
    Emitted 1
    Emitted 2
    Emitted 3
    Observable completed. Closing connection.
    closed without error

## Fixed server

The fixed-server example listens for plain (non-TLS) connections
on a fixed and without any http-server, so it uses a fixed token.
The client-fixed-server connects via TLS to a TLS proxy
that forwards the requests to the server.

The example can be run with stunnel:

```
stunnel example/stunnel.conf
node example/fixed-server.js
node example/client-fixed-server.js 12346
```
