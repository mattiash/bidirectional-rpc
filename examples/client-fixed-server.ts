import 'source-map-support/register'
import * as rpc from '../index'

let port = process.argv[2]

connect('127.0.0.1', parseInt(port), 'secret')
function connect(host: string, port: number, token: string) {
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
    })
}
