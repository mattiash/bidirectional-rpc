import 'source-map-support/register'
import * as rpc from '../index'
import * as fs from 'fs'
const cert = fs.readFileSync('../test/server-cert.pem').toString()
const key = fs.readFileSync('../test/server-key.pem').toString()

class ClientHandler extends rpc.RPCClientHandler {
    onMessage(data: any) {
        console.log('Server received', data)
        this.client.sendMessage({ test: 'back' })
    }
    onClose(had_error: boolean) {
        console.log(`closed with${had_error ? '' : 'out'} error`)
    }
}

async function run() {
    const server = new rpc.RPCServer(key, cert)
    server.listen(12345, '127.0.0.1')
    const TOKEN = server.registerClientHandler(new ClientHandler(), 10000)
    console.log('Token:', TOKEN)
    console.log('Fingerprint:', await server.fingerprint())
}

run()
