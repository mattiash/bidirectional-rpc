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

    onConnect() {
        this.connected.resolve()
    }

    onMessage(message: any) {
        this.messages.push(message)
    }

    onClose() {
        this.closed.resolve()
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
