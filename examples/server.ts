import 'source-map-support/register'
import * as rpc from '../index'
import * as fs from 'fs'
import * as http from 'http'
import { interval } from 'rxjs'
import { map, take } from 'rxjs/operators'

const cert = fs.readFileSync('../test/server-cert.pem').toString()
const key = fs.readFileSync('../test/server-key.pem').toString()

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
        this.client?.sendMessage({ test: 'back' })
    }

    async onClose(had_error: boolean) {
        console.log(`closed with${had_error ? '' : 'out'} error`)
        await super.onClose(had_error)
    }

    onQuestion() {
        return Promise.reject()
    }
}

let fingerprint = ''
const rpcServer = new rpc.RPCServer({
    tls: true,
    key,
    cert,
})
rpcServer.listen(PORT, IP)
rpcServer.fingerprint().then((fp) => (fingerprint = fp))

const httpServer = http.createServer((_request, response) => {
    let token = rpcServer.registerClientHandler(new ClientHandler(), 10000)
    response.setHeader('Content-type', 'application/json')
    response.end(JSON.stringify({ ip: IP, port: PORT, token, fingerprint }))
})

httpServer.listen(3000)
console.log('http server listening on http://localhost:3000')
