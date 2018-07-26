import 'source-map-support/register'
import * as rpc from '../index'

let token = process.argv[2]
let fingerprint = process.argv[3]

console.log('Token', token)
console.log('Fingerprint', fingerprint)
class ClientHandler extends rpc.RPCClientHandler {
    onConnect() {
        this.client.sendMessage({ test: 1 })
    }

    onMessage(data: any) {
        console.log('Client received', data)
        this.client.close()
    }

    onClose(had_error: boolean) {
        console.log(`closed with${had_error ? '' : 'out'} error`)
    }
}

new rpc.RPCClient(new ClientHandler(), 12345, '127.0.0.1', token, fingerprint)
