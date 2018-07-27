import 'source-map-support/register'
import * as rpc from '../index'
import * as http from 'http'

let url = process.argv[2]

http.get(url, res => {
    res.setEncoding('utf8')
    let rawData = ''
    res.on('data', chunk => {
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

function connect(ip: string, port: number, fingerprint: string, token: string) {
    console.log('Fingerprint', fingerprint)
    console.log('Token', token)
    class ClientHandler extends rpc.RPCClientHandler {
        onConnect() {
            this.client.sendMessage({ test: 1 })
            let obs = this.client.requestObservable('123')
            obs.subscribe(
                value => console.log('Emitted ' + value),
                undefined,
                () => {
                    console.log('Observable completed. Closing connection.')
                    this.client.close()
                }
            )
        }

        onMessage(data: any) {
            console.log('Client received', data)
        }

        onClose(had_error: boolean) {
            console.log(`closed with${had_error ? '' : 'out'} error`)
        }
    }

    new rpc.RPCClient(new ClientHandler(), port, ip, token, fingerprint)
}
