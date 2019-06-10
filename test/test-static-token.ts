import 'source-map-support/register'

import * as test from 'purple-tape'
import * as rpc from '../index'
import { readFileSync } from 'fs'
import { Deferred, RPCTestHandler } from './common'

async function listeningServer(): Promise<rpc.RPCServer> {
    let server = new rpc.RPCServer({
        tls: true,
        cert: readFileSync('./test/server-cert.pem').toString(),
        key: readFileSync('./test/server-key.pem').toString()
    })
    let listening = new Deferred()
    server.on('listening', listening.resolve)
    server.on('error', err => console.log('Server error', err))
    server.listen(0, '127.0.0.1')
    await listening.promise
    return server
}

async function closeServer(server: rpc.RPCServer) {
    let close = new Deferred()
    server.on('close', close.resolve)
    server.close()
    await close.promise
}

test('send messages from client to server', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    server.registerDefaultHandler(() => serverClientHandler)

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint,
        rejectUnauthorized: false
    })

    await clientHandler.connected.promise
    t.pass('Client connected')

    client.sendMessage('test1')
    client.sendMessage('test2')

    client.close()
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(
        serverClientHandler.messages.length,
        2,
        'Server received two messages'
    )
    t.equal(
        serverClientHandler.messages[0],
        'test1',
        'Server received test message 1'
    )
    t.equal(
        serverClientHandler.messages[1],
        'test2',
        'Server received test message 2'
    )
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})
