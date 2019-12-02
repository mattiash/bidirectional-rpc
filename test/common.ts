import * as test from 'purple-tape'
import { RPCClientHandler } from '../lib/rpc-client'
import { Observable } from 'rxjs'

export class Deferred {
    promise: Promise<void>
    resolve: () => void = () => null
    reject: (reason: any) => void = () => null

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}

export class RPCTestHandler extends RPCClientHandler {
    connected = new Deferred()
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

    async onClose(had_error: boolean) {
        this.closeCalls++
        await super.onClose(had_error)
    }

    onQuestion(_question: any): Promise<any> {
        return Promise.reject()
    }

    onRequestObservable(_params: any): Observable<number> | undefined {
        return undefined
    }

    onError(err: Error) {
        console.log(err.message)
        this.errors++
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
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
