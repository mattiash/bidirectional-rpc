import * as test from 'purple-tape'
import { RPCClientHandler } from '../lib/rpc-client'

export class Deferred {
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

export class RPCTestHandler extends RPCClientHandler {
    connected = new Deferred()
    closed = new Deferred()
    messages: any[] = []
    connectCalls = 0
    closeCalls = 0
    errors = 0

    onConnect() {
        this.connectCalls++
        this.connected.resolve()
    }

    onMessage(message: any) {
        this.messages.push(message)
    }

    onClose() {
        this.closeCalls++
        this.closed.resolve()
    }

    verifyConnected(t: test.Test) {
        t.equal(this.connectCalls, 1, 'Shall call onConnect once')
        t.equal(this.closeCalls, 1, 'Shall call onClose once')
    }

    verifyUnconnected(t: test.Test) {
        t.equal(this.connectCalls, 0, 'Shall not call onConnect')
        t.equal(this.closeCalls, 0, 'Shall not call onClose')
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
