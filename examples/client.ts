import 'source-map-support/register'
import * as rpc from '../index'
import * as http from 'http'

let url = process.argv[2]

http.get(url, (res) => {
    res.setEncoding('utf8')
    let rawData = ''
    res.on('data', (chunk) => {
        rawData += chunk
    })
    res.on('end', () => {
        try {
            const parsedData = JSON.parse(rawData)
            connect(
                parsedData.ip,
                parsedData.port,
                parsedData.fingerprint,
                parsedData.token
            )
        } catch (e) {
            console.error(e.message)
        }
    })
})

function connect(
    host: string,
    port: number,
    fingerprint: string,
    token: string
) {
    console.log('Fingerprint', fingerprint)
    console.log('Token', token)
    class ClientHandler extends rpc.RPCClientHandler {
        onConnect() {
            const client = this.client as rpc.RPCClient
            client.sendMessage({ test: 1 })
            let obs = client.requestObservable('123')
            obs.subscribe(
                (value) => console.log('Emitted ' + value),
                undefined,
                () => {
                    console.log('Observable completed. Closing connection.')
                    client.close()
                }
            )
        }

        onMessage(data: any) {
            console.log('Client received', data)
        }

        async onClose(had_error: boolean) {
            console.log(`closed with${had_error ? '' : 'out'} error`)
            await super.onClose(had_error)
        }

        onQuestion() {
            return Promise.reject()
        }

        onRequestObservable() {
            return undefined
        }
    }

    new rpc.RPCClient({
        handler: new ClientHandler(),
        port,
        host,
        token,
        fingerprint,
    })
}
