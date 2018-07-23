import 'source-map-support/register'

import * as test from 'purple-tape'
import * as rpc from '../index'
import { readFileSync } from 'fs'
import { from, interval } from 'rxjs'
import { toArray, take, map } from 'rxjs/operators'
from([1, 2, 3])
    .pipe(toArray())
    .toPromise()

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
    let server = new rpc.RPCServer(
        readFileSync('./test/server-key.pem').toString(),
        readFileSync('./test/server-cert.pem').toString()
    )
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

async function setup(t: test.Test) {
    let server = await listeningServer()
    let serverClientClosed = new Deferred()
    let serverObservableCreated = new Deferred()
    let serverClient!: rpc.RPCClient

    server.on('connection', (_serverClient, _token, cb) => {
        serverClient = _serverClient
        cb(true)
        serverClient.on('requestObservable', (message: any, cb) => {
            switch (message) {
                case '123':
                    cb(
                        interval(100).pipe(
                            take(3),
                            map(n => n + 1)
                        )
                    )
                    serverObservableCreated.resolve()
                    break
                case 'infinite':
                    cb(
                        interval(100).pipe(
                            map(n => n + 1)
                        )
                    )
                    serverObservableCreated.resolve()
                    break
            }
        })
        serverClient.on('close', serverClientClosed.resolve)
    })

    let address = server.address()
    let client = new rpc.RPCClient(address.port, address.address, 'token1')
    let connected = new Deferred()
    let closed = new Deferred()
    client.on('connect', connected.resolve)
    client.on('close', closed.resolve)

    await connected.promise
    t.pass('client connected')

    return {
        client,
        serverClient,
        serverObservableCreated,
        serverClientClosed,
        server,
        closed,
        connected
    }
}

async function teardown(
    t: test.Test,
    s: {
        client: rpc.RPCClient
        serverClient: rpc.RPCClient
        serverObservableCreated: Deferred
        serverClientClosed: Deferred
        server: rpc.RPCServer
        closed: Deferred
        connected: Deferred
    }
) {
    s.client.close()
    await s.serverClientClosed.promise
    t.pass('serverClient closed')
    await s.closed.promise
    t.pass('client closed')

    await closeServer(s.server)
    t.pass('closed')
}

test('observable completes', async function(t) {
    let s = await setup(t)
    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    let p = obs.pipe(toArray()).toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    await s.serverObservableCreated.promise
    await sleep(200)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 1, 'Subscription created')
    let result = await p
    t.deepEqual(result, [1, 2, 3], 'shall emit correct values')
    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions anymore')
    await teardown(t, s)
})

test('subscriber unsubscribes', async function(t) {
    let s = await setup(t)
    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    let p = obs
        .pipe(
            take(2),
            toArray()
        )
        .toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    await s.serverObservableCreated.promise
    await sleep(200)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 1, 'Subscription created')
    let result = await p
    t.deepEqual(result, [1, 2], 'shall emit correct values')
    t.equal(s.client._observers(), 0, 'No observers anymore')
    await sleep(500)
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions anymore')
    await teardown(t, s)
})

test('observable completes and subscriber unsubscribes at same time', async function(t) {
    let s = await setup(t)

    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    let p = obs
        .pipe(
            take(3),
            toArray()
        )
        .toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    await s.serverObservableCreated.promise
    await sleep(200)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 1, 'Subscription created')

    let result = await p
    t.deepEqual(result, [1, 2, 3], 'shall emit correct values')

    t.equal(s.client._observers(), 0, 'No observers anymore')
    await sleep(500)
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions anymore')

    await teardown(t, s)
})

test('client closes connection', async function(t) {
    let emitted = new Deferred()
    let completed = new Deferred()

    let s = await setup(t)
    let obs = s.client.requestObservable('infinite')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    obs.subscribe(
        _value => {
            s.client.close()
            emitted.resolve()
        },
        undefined,
        () => completed.resolve()
    )
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    await s.serverObservableCreated.promise
    await emitted.promise
    await completed.promise
    t.pass('observable completed')

    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions anymore')
    await s.serverClientClosed.promise
    t.pass('serverClient closed')
    await s.closed.promise
    t.pass('client closed')

    await closeServer(s.server)
    t.pass('closed')
})

test('server closes connection', async function(t) {
    let emitted = new Deferred()
    let completed = new Deferred()

    let s = await setup(t)
    let obs = s.client.requestObservable('infinite')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    obs.subscribe(
        _value => {
            s.serverClient.close()
            emitted.resolve()
        },
        undefined,
        () => completed.resolve()
    )
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions yet')
    await s.serverObservableCreated.promise
    await emitted.promise
    await completed.promise
    t.pass('observable completed')

    await s.serverClientClosed.promise
    t.pass('serverClient closed')

    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(s.serverClient._subscriptions(), 0, 'No subscriptions anymore')
    await s.closed.promise
    t.pass('client closed')

    await closeServer(s.server)
    t.pass('closed')
})

function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
