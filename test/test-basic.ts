import * as test from 'purple-tape'
import * as rpc from '../index'

class Deferred {
    promise: Promise<void>
    resolve: () => void
    reject: (reason: any) => void

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}

async function listeningServer(): Promise<rpc.RPCServer> {
    let server = new rpc.RPCServer()
    let listening = new Deferred()
    server.on('listening', listening.resolve)
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
    let clients = 0
    let serverMessages: any[] = []
    let server = await listeningServer()
    t.pass('listening')
    server.on('connection', (serverClient, token) => {
        t.equal(token, 'token1', 'shall pass token correctly')
        serverClient.on('message', (message: any) =>
            serverMessages.push(message)
        )
        clients++
    })
    let address = server.address()
    let client = new rpc.RPCClient(address.port, address.address, 'token1')
    let connected = new Deferred()
    client.on('connect', connected.resolve)
    await connected.promise
    t.pass('connected')
    client.sendMessage('test1')
    client.sendMessage('test2')

    client.close()

    await closeServer(server)
    t.pass('closed')
    t.equal(clients, 1, 'One client connected')
    t.equal(serverMessages.length, 2, 'Server received two messages')
    t.equal(serverMessages[0], 'test1', 'Server received test message 1')
    t.equal(serverMessages[1], 'test2', 'Server received test message 2')
})

test('send messages from server to client', async function(t) {
    let clients = 0
    let serverMessages: any[] = []
    let clientMessages: any[] = []
    let server = await listeningServer()
    t.pass('listening')
    server.on('connection', (serverClient, token) => {
        t.equal(token, 'token2', 'shall pass token correctly')

        serverClient.on('message', (message: any) => {
            serverMessages.push(message)
            serverClient.sendMessage(message + ' response')
            if (message === 'close') {
                serverClient.close()
            }
        })
        clients++
    })
    let address = server.address()
    let client = new rpc.RPCClient(address.port, address.address, 'token2')
    client.on('message', (message: any) => clientMessages.push(message))
    let connected = new Deferred()
    client.on('connect', connected.resolve)
    let closed = new Deferred()
    client.on('close', closed.resolve)
    await connected.promise
    t.pass('connected')
    client.sendMessage('test1')
    client.sendMessage('test2')
    client.sendMessage('close')

    client.close()
    await closed.promise

    await closeServer(server)
    t.pass('closed')
    t.equal(clients, 1, 'One client connected')
    t.equal(serverMessages.length, 3, 'Server received two messages')
    t.equal(serverMessages[0], 'test1', 'Server received test message 1')
    t.equal(serverMessages[1], 'test2', 'Server received test message 2')
    t.equal(clientMessages.length, 3, 'Client received two messages')
    t.equal(
        clientMessages[0],
        'test1 response',
        'Client received test message 1 response'
    )
    t.equal(
        clientMessages[1],
        'test2 response',
        'Client received test message 2 response'
    )
    t.equal(
        clientMessages[2],
        'close response',
        'Client received close response'
    )
})

test('ask question and respond', async function(t) {
    let clientMessages: any[] = []
    let server = await listeningServer()
    t.pass('listening')
    server.on('connection', serverClient => {
        serverClient.on(
            'ask',
            (message: any, respond: (message: any) => void) => {
                respond(message + ' response')
            }
        )
    })
    let address = server.address()
    let client = new rpc.RPCClient(address.port, address.address, 'token3')
    client.on('message', (message: any) => clientMessages.push(message))
    let connected = new Deferred()
    client.on('connect', connected.resolve)
    let closed = new Deferred()
    client.on('close', closed.resolve)
    await connected.promise
    t.pass('connected')
    let response = await client.ask('test1')
    t.equal(response, 'test1 response', 'shall receive response to question')
    client.close()
    await closed.promise

    await closeServer(server)
    t.pass('closed')
})

test('slow responses shall not block other responses', async function(t) {
    let clientMessages: any[] = []
    let server = await listeningServer()
    t.pass('listening')
    server.on('connection', serverClient => {
        serverClient.on('ask', (message, respond) => {
            setTimeout(() => respond(message.d + ' response'), message.t)
        })
    })
    let address = server.address()
    let client = new rpc.RPCClient(address.port, address.address, 'token4')
    client.on('message', (message: any) => clientMessages.push(message))
    let connected = new Deferred()
    client.on('connect', connected.resolve)
    let closed = new Deferred()
    client.on('close', closed.resolve)
    await connected.promise
    t.pass('connected')
    let receivedLast = ''
    let response1 = ''
    let response2 = ''
    await Promise.all([
        (async () => {
            response1 = await client.ask({ d: 'test1', t: 1000 })
            receivedLast = 'test1'
        })(),
        (async () => {
            response2 = await client.ask({ d: 'test2', t: 0 })
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
    await closed.promise

    await closeServer(server)
    t.pass('closed')
    t.equal(client.outstandingQuestions(), 0, 'no outstanding questions')
})
