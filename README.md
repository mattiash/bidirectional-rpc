# Bidirectional RPC

[![Build Status](https://travis-ci.org/mattiash/bidirectional-rpc.svg?branch=master)](https://travis-ci.org/mattiash/bidirectional-rpc) [![Coverage Status](https://coveralls.io/repos/github/mattiash/bidirectional-rpc/badge.svg?branch=master)](https://coveralls.io/github/mattiash/bidirectional-rpc?branch=master)

This module implements an RPC mechanism that meets the following requirements:

1. Initialized from one end-point (client) to the other (server).
2. A message can be sent both from server to client and from client to server.
3. A question is a message that requests a response from the other end. Questions can be asked both by the server and the client.
4. The end-point that receives a question can send the response asynchronously.
5. All messages and responses are sent and delivered as javascript data that can be serialized as json.
6. All communication is sent over a tcp socket protected with TLS.
7. Communication is protected against man-in-the-middle attacks if the client and server have a trust relationship established via some other mechanism.
8. The RPC mechanism exits with an error in both server and client if the communication fails.

## Server Example

```javascript
let server = new RPCServer()
server.listen(3000, '127.0.0.1')

server.on('listening', () => {
    let address = server.address()
    console.log(`Listening on ${address.address}:${address.port}`)
})

server.on('connection', rpcClient => {
    rpcClient.on('message', message =>
        console.log(`Server received ${message}`)
    )
})
```

## Client example

```javascript
let client = new rpc.RPCClient(3000, '127.0.0.1')
client.on('connect', () => client.sendMessage('test'))
```

## Observables via bidirectional RPC

Request observable

```javascript
let observable = client.observable(params)
observable.subscribe(...)
// Will emit an error if other end refuses the observable
```

```javascript
client.observableRequest(params => {
    return Observable.from([1, 2, 3])
})
```
