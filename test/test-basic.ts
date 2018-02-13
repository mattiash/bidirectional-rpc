import * as test from 'purple-tape'
import * as rpc from '../index'

class Deferred<T> {
    promise: Promise<T>
    resolve: (arg: T) => void
    reject: (reason: any) => void

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}

test('create server', async function(t) {
    let server = new rpc.RPCServer()
    let listening = new Deferred()
    server.on('listening', listening.resolve)

    let close = new Deferred()
    server.on('close', close.resolve)
    server.listen(0, '127.0.0.1')
    await listening.promise
    t.pass('listening')
    server.close()
    await close.promise
    t.pass('closed')
})
