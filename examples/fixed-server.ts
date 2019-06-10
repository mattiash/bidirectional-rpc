import 'source-map-support/register'
import * as rpc from '../index'
import { interval } from 'rxjs'
import { map, take } from 'rxjs/operators'

const IP = '127.0.0.1'
const PORT = 12345

class ClientHandler extends rpc.RPCClientHandler {
    onRequestObservable(params: string) {
        if (params === '123') {
            return interval(1000).pipe(
                map((c) => c + 1),
                take(3)
            )
        }
        return undefined
    }

    onMessage(data: any) {
        console.log('Server received', data)
        this.client.sendMessage({ test: 'back' })
    }
    onClose(had_error: boolean) {
        console.log(`closed with${had_error ? '' : 'out'} error`)
    }

    onQuestion() {
        return Promise.reject()
    }
}

const rpcServer = new rpc.RPCServer({ tls: false })
rpcServer.registerDefaultHandler(
    (token: string) => (token === 'secret' ? new ClientHandler() : undefined)
)
rpcServer.listen(PORT, IP)

console.log('RPC Server listening on port 12345')
