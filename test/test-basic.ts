import 'source-map-support/register'

import * as test from 'purple-tape'
import * as rpc from '../index'
import { readFileSync } from 'fs'
import { Deferred, sleep, RPCTestHandler } from './common'
import { _SET_IDLE_TIMEOUT_DEFAULT } from '../lib/rpc-client'

_SET_IDLE_TIMEOUT_DEFAULT(3000)

async function listeningServer(): Promise<rpc.RPCServer> {
    let server = new rpc.RPCServer(
        readFileSync('./test/server-key.pem').toString(),
        readFileSync('./test/server-cert.pem').toString()
    )
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

test('create server', async function(t) {
    let server = await listeningServer()
    t.pass('listening')

    await closeServer(server)
    t.pass('closed')
})

test('send messages from client to server', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    client.sendMessage('test1')
    client.sendMessage('test2')

    client.close()
    await serverClientHandler.closed.promise
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

test('send messages from server to client', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    const token = server.registerClientHandler(serverClientHandler, 3000)

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token,
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    serverClientHandler.client.sendMessage('test1')
    serverClientHandler.client.sendMessage('test2')

    while (clientHandler.messages.length < 2) {
        await sleep(100)
    }

    client.close()
    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(clientHandler.messages.length, 2, 'Client received two messages')
    t.equal(
        clientHandler.messages[0],
        'test1',
        'Client received test message 1'
    )
    t.equal(
        clientHandler.messages[1],
        'test2',
        'Client received test message 2'
    )
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test("don't allow token reuse", async function(t) {
    let server = await listeningServer()
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    try {
        server.registerClientHandler(serverClientHandler, 3000, 'token1')
        t.fail('shall not allow tokens to be used more than once')
    } catch (e) {
        t.ok('shall not allow tokens to be used more than once')
    }

    await closeServer(server)
    t.pass('closed')
})

test('ask question and respond', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    serverClientHandler.onQuestion = (question: any) =>
        Promise.resolve(question + ' response')
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    let response = await client.askQuestion('test1')
    t.equal(response, 'test1 response', 'shall receive response to question')
    client.close()
    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test('ask question and reject', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    serverClientHandler.onQuestion = (question: any) =>
        Promise.reject(question + ' response')
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    let response = await client.askQuestion('test1').catch(e => 'error ' + e)
    t.equal(
        response,
        'error test1 response',
        'shall receive rejection to question'
    )
    client.close()
    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test('slow responses shall not block other responses', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    serverClientHandler.onQuestion = (question: any) => {
        return new Promise(resolve =>
            setTimeout(() => resolve(question.d + ' response'), question.t)
        )
    }
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    let receivedLast = ''
    let response1 = ''
    let response2 = ''
    await Promise.all([
        (async () => {
            response1 = await client.askQuestion({ d: 'test1', t: 1000 })
            receivedLast = 'test1'
        })(),
        (async () => {
            response2 = await client.askQuestion({ d: 'test2', t: 0 })
            receivedLast = 'test2'
        })()
    ])
    t.equal(response1, 'test1 response', 'shall receive response to question')
    t.equal(response2, 'test2 response', 'shall receive response to question')
    t.equal(
        receivedLast,
        'test1',
        'slow responses shall not block fast responses'
    )
    client.close()
    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(client.outstandingQuestions(), 0, 'no outstanding questions')
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test('timeout response', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    serverClientHandler.onQuestion = (question: any) => {
        return new Promise(resolve =>
            setTimeout(() => resolve(question.d + ' response'), question.t)
        )
    }
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    let receivedLast = ''
    let response1 = ''
    let response2 = ''
    await Promise.all([
        (async () => {
            response1 = await client
                .askQuestion({ d: 'test1', t: 3000 }, 200)
                .catch(() => 'timeout')
            receivedLast = 'test1'
        })(),
        (async () => {
            response2 = await client.askQuestion({ d: 'test2', t: 0 })
            receivedLast = 'test2'
        })()
    ])
    t.equal(response1, 'timeout', 'shall receive timeout')
    t.equal(response2, 'test2 response', 'shall receive response to question')
    t.equal(
        receivedLast,
        'test1',
        'slow responses shall not block fast responses'
    )
    await sleep(3000)
    client.close()
    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(client.outstandingQuestions(), 0, 'no outstanding questions')
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test('client shall reject certificate with wrong fingerprint', async function(t) {
    let connectError = new Deferred()

    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClient1Handler = new RPCTestHandler()
    server.registerClientHandler(serverClient1Handler, 3000, 'token1')

    let address = server.address()

    let client1Handler = new RPCTestHandler()

    let client1 = new rpc.RPCClient({
        handler: client1Handler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClient1Handler.connected.promise
    t.pass('Server Client connected')
    await client1Handler.connected.promise
    t.pass('Client connected')

    client1.close()
    await serverClient1Handler.closed.promise
    t.pass('serverClient1 closed')
    await client1Handler.closed.promise
    t.pass('client1 closed')

    let serverClient2Handler = new RPCTestHandler()
    server.registerClientHandler(serverClient2Handler, 3000, 'token2')

    let client2Handler = new RPCTestHandler()
    client2Handler.onError = (err: Error) => {
        if (err.message.match(/Wrong certificate/)) {
            connectError.resolve()
        }
    }
    client2Handler.onConnect = () => t.fail('shall not connect')

    new rpc.RPCClient({
        handler: client2Handler,
        port: address.port,
        host: address.address,
        token: 'token2',
        fingerprint: 'wrong'
    })

    await connectError.promise
    t.pass('client received connection error')

    await closeServer(server)
    t.pass('closed')
    serverClient1Handler.verifyConnected(t)
    serverClient2Handler.verifyUnconnected(t)
    client1Handler.verifyConnected(t)
    client2Handler.verifyUnconnected(t)
})

test('server shall reject client with wrong token', async function(t) {
    let connectError = new Deferred()

    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClient1Handler = new RPCTestHandler()
    server.registerClientHandler(serverClient1Handler, 3000, 'token1')

    let address = server.address()

    let client1Handler = new RPCTestHandler()
    client1Handler.onError = (err: Error) => {
        if (err.message === 'Connection not accepted') {
            connectError.resolve()
        }
    }

    new rpc.RPCClient({
        handler: client1Handler,
        port: address.port,
        host: address.address,
        token: 'wrong',
        fingerprint
    })

    await connectError.promise
    t.pass('Client rejected')

    await closeServer(server)
    t.pass('closed')
    serverClient1Handler.verifyUnconnected(t)
    client1Handler.verifyUnconnected(t)
})

test('idle handling', async function(t) {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()

    let serverClientHandler = new RPCTestHandler()
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    const clientReceive = (client as any).lastReceive
    const serverReceive = (serverClientHandler.client as any).lastReceive
    await sleep(4000)

    t.ok(
        (client as any).lastReceive > clientReceive,
        'client shall have received ping'
    )
    t.ok(
        (serverClientHandler.client as any).lastReceive > serverReceive,
        'server shall have received ping'
    )

    clearTimeout((client as any).idleTimer)

    t.pass('Waiting for timeout')

    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')

    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})

test('client closes connection with outstanding questions', async t => {
    let server = await listeningServer()
    t.pass('Listening')
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')

    let serverClientHandler = new RPCTestHandler()
    serverClientHandler.onQuestion = (question: any) => {
        return new Promise(resolve =>
            setTimeout(() => resolve(question.d + ' response'), question.t)
        )
    }
    server.registerClientHandler(serverClientHandler, 3000, 'token1')

    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        fingerprint
    })

    await serverClientHandler.connected.promise
    t.pass('Server Client connected')
    await clientHandler.connected.promise
    t.pass('Client connected')

    let askTime = Date.now()
    let respTime: number = askTime + 5000

    let p = client.askQuestion({ d: 'test1', t: 5000 }, 3000).catch(() => {
        respTime = Date.now()
        return 'threw'
    })

    client.close()

    let response1 = await p
    t.equal(response1, 'threw', 'shall throw an error')
    t.ok(
        respTime - askTime < 2000,
        'shall throw an error on closing, not on timeout'
    )

    await serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(client.outstandingQuestions(), 0, 'no outstanding questions')
    serverClientHandler.verifyConnected(t)
    clientHandler.verifyConnected(t)
})
