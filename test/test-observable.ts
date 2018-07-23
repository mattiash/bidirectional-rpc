import 'source-map-support/register'

import * as test from 'purple-tape'
import * as rpc from '../index'
import { readFileSync } from 'fs'
import { from } from 'rxjs'
import { toArray, take } from 'rxjs/operators'

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

test('observable emits value in client', async function(t) {
    let clients = 0
    let server = await listeningServer()
    let fingerprint = await server.fingerprint()
    t.ok(fingerprint, 'Server shall have a fingerprint')
    t.pass('listening')
    let serverClientClosed = new Deferred()

    server.on('connection', (serverClient, token, cb) => {
        t.equal(token, 'token1', 'shall pass token correctly')
        cb(true)
        serverClient.on('requestObservable', (_message: any) => from([1, 2, 3]))
        serverClient.on('close', serverClientClosed.resolve)
        clients++
    })
    let address = server.address()
    let client = new rpc.RPCClient(
        address.port,
        address.address,
        'token1',
        fingerprint
    )
    let connected = new Deferred()
    let closed = new Deferred()
    client.on('connect', connected.resolve)
    client.on('close', closed.resolve)
    await connected.promise
    t.pass('client connected')
    let obs = client.requestObservable('test1')
    let result = await obs.pipe(toArray()).toPromise()
    t.deepEqual(result, [1, 2, 3], 'shall emit correct values')

    let obs2 = client.requestObservable('test1')
    let result2 = await obs2
        .pipe(
            take(2),
            toArray()
        )
        .toPromise()
    t.deepEqual(
        result2,
        [1, 2],
        'shall emit correct values when subscriber does not want all values'
    )

    client.close()
    await serverClientClosed.promise
    t.pass('serverClient closed')
    await closed.promise
    t.pass('client closed')

    await closeServer(server)
    t.pass('closed')
    t.equal(clients, 1, 'One client connected')
})
