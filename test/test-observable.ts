import 'source-map-support/register'

import * as test from 'purple-tape'
import * as rpc from '../index'
import { readFileSync } from 'fs'
import { interval } from 'rxjs'
import { toArray, take, map } from 'rxjs/operators'
import { RPCClient } from '../lib/rpc-client'
import { RPCServer } from '../lib/rpc-server'
import { Deferred, sleep, RPCTestHandler } from './common'

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

class RPCTestServerHandler extends RPCTestHandler {
    observableCreated = new Deferred()
    onRequestObservable(params: any) {
        this.observableCreated.resolve()
        switch (params) {
            case '123':
                return interval(1000).pipe(
                    take(3),
                    map(n => n + 1)
                )
            case 'infinite':
                return interval(100).pipe(map(n => n + 1))
        }
        return undefined
    }

    onQuestion() {
        return Promise.reject()
    }
}

async function setup(t: test.Test) {
    let server = await listeningServer()

    const serverClientHandler = new RPCTestServerHandler()
    server.registerClientHandler(serverClientHandler, 3000, 'token1')
    let address = server.address()

    let clientHandler = new RPCTestHandler()
    let client = new rpc.RPCClient({
        handler: clientHandler,
        port: address.port,
        host: address.address,
        token: 'token1',
        rejectUnauthorized: false
    })

    await clientHandler.connected.promise
    t.pass('client connected')

    return {
        client,
        clientHandler,
        server,
        serverClientHandler
    }
}

async function teardown(
    t: test.Test,
    s: {
        client: RPCClient
        server: RPCServer
    }
) {
    s.client.close()
    await closeServer(s.server)
    t.pass('closed')
}

test('observable completes', async function(t) {
    let s = await setup(t)
    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    let p = obs.pipe(toArray()).toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    await s.serverClientHandler.observableCreated.promise
    await sleep(200)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        1,
        'Subscription created'
    )
    let result = await p
    t.deepEqual(result, [1, 2, 3], 'shall emit correct values')
    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions anymore'
    )
    await teardown(t, s)
})

test('subscriber unsubscribes', async function(t) {
    let s = await setup(t)
    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    let p = obs
        .pipe(
            take(2),
            toArray()
        )
        .toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    await s.serverClientHandler.observableCreated.promise
    await sleep(2000)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        1,
        'Subscription created'
    )
    let result = await p
    t.deepEqual(result, [1, 2], 'shall emit correct values')
    t.equal(s.client._observers(), 0, 'No observers anymore')
    await sleep(500)
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions anymore'
    )
    await teardown(t, s)
})

test('observable completes and subscriber unsubscribes at same time', async function(t) {
    let s = await setup(t)
    let obs = s.client.requestObservable('123')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    let p = obs
        .pipe(
            take(3),
            toArray()
        )
        .toPromise()
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    await s.serverClientHandler.observableCreated.promise
    await sleep(200)
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        1,
        'Subscription created'
    )
    let result = await p
    t.deepEqual(result, [1, 2, 3], 'shall emit correct values')
    t.equal(s.client._observers(), 0, 'No observers anymore')
    await sleep(500)
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions anymore'
    )
    await teardown(t, s)
})

test('client closes connection', async function(t) {
    let emitted = new Deferred()
    let completed = new Deferred()

    let s = await setup(t)
    let obs = s.client.requestObservable('infinite')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    obs.subscribe(
        _value => {
            s.client.close()
            emitted.resolve()
        },
        undefined,
        () => completed.resolve()
    )
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    await emitted.promise
    await completed.promise
    t.pass('observable completed')

    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions anymore'
    )
    await s.serverClientHandler.closed.promise
    t.pass('serverClient closed')
    await s.clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(s.server)
    t.pass('closed')
    s.serverClientHandler.verifyConnected(t)
    s.clientHandler.verifyConnected(t)
})

test('server closes connection', async function(t) {
    let emitted = new Deferred()
    let completed = new Deferred()

    let s = await setup(t)
    let obs = s.client.requestObservable('infinite')
    t.equal(s.client._observers(), 0, 'No observers yet')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    obs.subscribe(
        _value => {
            s.serverClientHandler.client.close()
            emitted.resolve()
        },
        undefined,
        () => completed.resolve()
    )
    t.equal(s.client._observers(), 1, 'Observer created')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions yet'
    )
    await emitted.promise
    await completed.promise
    t.pass('observable completed')

    await s.serverClientHandler.closed.promise
    t.pass('serverClient closed')

    t.equal(s.client._observers(), 0, 'No observers anymore')
    t.equal(
        s.serverClientHandler.client._subscriptions(),
        0,
        'No subscriptions anymore'
    )
    await s.clientHandler.closed.promise
    t.pass('client closed')

    await closeServer(s.server)
    t.pass('closed')
    s.serverClientHandler.verifyConnected(t)
    s.clientHandler.verifyConnected(t)
})
