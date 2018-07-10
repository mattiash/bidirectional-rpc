import * as net from 'net'
import * as tls from 'tls'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { RPCClient } from './rpc-client'

export class RPCServer extends EventEmitter {
    private server: net.Server
    constructor(key: string, private cert: string) {
        super()
        this.server = tls.createServer({ key, cert })
        this.server.on('listening', () => this.emit('listening'))
        this.server.on('close', () => this.emit('close'))
        this.server.on('error', err => this.emit('error', err))
        this.server.on('secureConnection', (client: tls.TLSSocket) => {
            this.newClient(client)
        })
    }

    on(event: 'listening', listener: () => void): this
    on(event: 'close', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(
        event: 'connection',
        listener: (
            client: RPCClient,
            token: string,
            cb: (accept: boolean) => void
        ) => void
    ): this
    on(event: string, listener: (...args: any[]) => void) {
        return super.on(event, listener)
    }

    fingerprint(): Promise<string> {
        return new Promise((resolve, reject) => {
            let cp = exec(
                'openssl x509 -noout -fingerprint',
                (error, stdout) => {
                    if (error) {
                        reject(error)
                    } else {
                        let m = stdout.match(/Fingerprint=(\S+)/)
                        if (!m) {
                            reject(`No fingerprint in '${stdout}'`)
                        } else {
                            resolve(m[1])
                        }
                    }
                }
            )
            cp.stdin.write(this.cert + '\n')
            cp.stdin.end()
        })
    }

    address(): net.AddressInfo {
        return this.server.address() as net.AddressInfo
    }

    listen(port: number, ip: string) {
        this.server.listen(port, ip)
    }

    close() {
        this.server.close()
    }

    private newClient(socket: tls.TLSSocket) {
        let client = new RPCClient(socket)
        client.on('initialized', token => {
            this.emit('connection', client, token, (accept: boolean) => {
                if (accept) {
                    client._accept()
                } else {
                    client._deny()
                }
            })
        })
    }
}
