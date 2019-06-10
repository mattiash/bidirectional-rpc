import * as net from 'net'
import * as tls from 'tls'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { RPCClient, RPCClientHandler } from './rpc-client'
import { v4 as uuidv4 } from 'uuid'

/**
 * @param key Private keys in PEM format. See tls.createServer in nodejs
 * @param cert  Cert chains in PEM format. See tls.createServer in nodejs.
 */

interface RPCServerOptionsSecure {
    tls: true
    key: tls.TlsOptions['key']
    cert: tls.TlsOptions['cert']
}

interface RPCServerOptionsInsecure {
    tls: false
}

type RPCServerOptions = RPCServerOptionsInsecure | RPCServerOptionsSecure

export class RPCServer extends EventEmitter {
    private server: net.Server
    private cert?: tls.TlsOptions['cert']
    private unusedTokens = new Map<string, RPCClientHandler>()
    private defaultHandler: (
        token: string
    ) => RPCClientHandler | undefined = () => undefined

    /**
     * Create a server
     */
    constructor(options: RPCServerOptions) {
        super()
        if (options.tls) {
            this.cert = options.cert
            this.server = tls.createServer({
                key: options.key,
                cert: options.cert
            })
            this.server.on('secureConnection', (client: tls.TLSSocket) => {
                this.newClient(client)
            })
        } else {
            this.server = net.createServer()
            this.server.on('connection', (client: net.Socket) => {
                this.newClient(client)
            })
        }
        this.server.on('listening', () => this.emit('listening'))
        this.server.on('close', () => this.emit('close'))
        this.server.on('error', err => this.emit('error', err))
    }

    on(event: 'listening' | 'close', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(
        event: 'connection',
        listener: (
            client: RPCClient,
            token: string,
            cb: (accept: boolean) => void
        ) => void
    ): this
    on(
        event: 'invalid_token',
        listener: (ip: string, token: string) => void
    ): this
    on(event: string, listener: (...args: any[]) => void) {
        return super.on(event, listener)
    }

    fingerprint(): Promise<string> {
        if (this.cert) {
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
        } else {
            throw new Error('No fingerprint when not using TLS')
        }
    }

    address() {
        let address = this.server.address()
        if (typeof address === 'string') {
            throw new Error('Address cannot be a string...')
        }
        return address
    }

    listen(port: number, ip: string) {
        this.server.listen(port, ip)
    }

    close() {
        this.server.close()
    }

    /**
     *
     * Add a token that shall be accepted. When a peer presents
     * this token, it will be associated with the provided RPCClientHandler.
     * A token can only be used once. It expires after timeoutMs.
     * If no token is provided, a random token is generated.
     * The function returns the token.
     *
     * @param clientHandler An instance of RPCClientHandler that provides callbacks
     *                      for this client
     * @param timeoutMs     The time that the token is valid. A client must connect within
     *                      this timeout, otherwise the token expires.
     * @param token
     *
     * @returns The supplied token or the generated random token.
     *
     */

    registerClientHandler(
        clientHandler: RPCClientHandler,
        timeoutMs = 3000,
        token?: string
    ): string {
        if (!token) {
            token = uuidv4()
        }

        if (this.unusedTokens.has(token)) {
            throw new Error(`Token ${token} used twice`)
        }

        this.unusedTokens.set(token, clientHandler)

        setTimeout(
            () => token && this.unusedTokens.delete(token),
            timeoutMs
        ).unref()

        return token
    }

    /**
     * Register a function that returns an RPCClientHandler for a specific token.
     * This can be used instead of registerClientHandler,
     * for example if a pre-shared secret is used as token.
     */
    registerDefaultHandler(
        defaultHandler: (token: string) => RPCClientHandler | undefined
    ) {
        this.defaultHandler = defaultHandler
    }

    private newClient(socket: tls.TLSSocket | net.Socket) {
        let client = new RPCClient(socket)
        client.on('initialized', token => {
            let handler =
                this.unusedTokens.get(token) || this.defaultHandler(token)
            if (!handler) {
                this.emit('invalid_token', socket.remoteAddress, token)
                client._deny()
            } else {
                client.setHandler(handler)
                this.unusedTokens.delete(token)
                client._accept()
            }
        })

        client.on('error', err => {
            this.emit('error', err)
        })
    }
}
