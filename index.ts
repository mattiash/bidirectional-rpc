import 'source-map-support/register'
import * as net from 'net'
import * as tls from 'tls'
import * as readline from 'readline'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import * as assert from 'assert'

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
        listener: (client: RPCClient, token: string, cb: (accept: boolean) => void) => void
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

    address() {
        return this.server.address()
    }

    listen(port: number, ip: string) {
        this.server.listen(port, ip)
    }

    close() {
        this.server.close()
    }

    newClient(socket: tls.TLSSocket) {
        let client = new RPCClient(socket)
        client.on('initialized', token => {
            this.emit('connection', client, token, (accept: boolean) => {
                if (accept) {
                    client.accept()
                } else {
                    client.deny()
                }
            })
        })
    }
}
class Deferred<T> {
    promise: Promise<T>
    resolve: (arg: T) => void
    reject: (reason: any) => void

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}

type Question = {
    deferred: Deferred<any>
    timer: NodeJS.Timer
}

export type ResponderFunction = (response: any) => void

export class RPCClient extends EventEmitter {
    private socket: tls.TLSSocket
    private rl: readline.ReadLine
    private msgId = 0
    private outstandingQuestionMap: Map<number, Question> = new Map()
    private token: string
    private initialized = false
    private fingerprint: string | undefined

    constructor(port: number, ip: string, token: string, fingerprint?: string)
    constructor(socket: tls.TLSSocket)
    constructor(
        p1: tls.TLSSocket | number,
        p2?: string,
        p3?: string,
        p4?: string
    ) {
        super()
        if (
            typeof p1 === 'number' &&
            typeof p2 === 'string' &&
            typeof p3 === 'string'
        ) {
            this.token = p3
            this.initialized = true
            this.socket = tls.connect({
                host: p2,
                port: p1,
                rejectUnauthorized: false
            })
            this.socket.on('secureConnect', () => {
                if (this.fingerprint) {
                    if (
                        this.socket.getPeerCertificate().fingerprint !==
                        this.fingerprint
                    ) {
                        this.socket.end()
                        this.emit(
                            'error',
                            'Wrong certificate presented by server'
                        )
                        return
                    }
                }
                this.sendInit()
            })
        } else {
            this.socket = p1 as tls.TLSSocket
        }

        this.fingerprint = p4
        this.socket.on('close', (had_error: boolean) => {
            this.emit('close', had_error)
        })
        this.rl = readline.createInterface({
            input: this.socket,
            output: this.socket
        })
        this.rl.on('line', line => this.receive(line))
    }

    on(event: 'connect', listener: () => void): this
    on(event: 'initialized', listener: (token: string) => void): this
    on(event: 'close', listener: (had_error: boolean) => void): this
    on(event: 'error', listener: (errorMessage: string) => void): this
    on(event: 'message', listener: (message: any) => void): this
    on(
        event: 'ask',
        listener: (message: any, responder: ResponderFunction) => void
    ): this
    on(event: string, listener: (...args: any[]) => void) {
        return super.on(event, listener)
    }

    outstandingQuestions(): number {
        return this.outstandingQuestionMap.size
    }

    send(type: string, data?: any, id?: number) {
        this.socket.write(
            JSON.stringify({
                t: type,
                d: data,
                id // If id is undefined it is not represented in json
            }) + '\n'
        )
    }
    sendMessage(message: any) {
        this.send('msg', message)
    }

    sendInit() {
        this.send('init', this.token)
    }

    ask(message: any, timeout: number = 2000): Promise<any> {
        let deferred = new Deferred()
        let id = this.msgId++
        let timer = global.setTimeout(() => {
            deferred.reject('timeout'), timeout
        }, 2000)
        this.outstandingQuestionMap.set(id, { deferred, timer })
        this.send('ask', message, id)
        return deferred.promise
    }

    private respond(id: number, message: any) {
        this.socket.write(
            JSON.stringify({
                t: 'resp',
                id,
                d: message
            }) + '\n'
        )
    }

    close() {
        this.socket.end()
    }

    accept() {
        assert(!this.initialized)
        this.initialized = true
        this.send('accepted')
    }

    deny() {
        assert(!this.initialized)
        this.send('denied')
        this.socket.end()
    }

    private receive(line: string) {
        let data = JSON.parse(line)
        if (!this.initialized) {
            if (data.t === 'init') {
                this.emit('initialized', data.d)
            }
        } else {
            switch (data.t) {
                case 'accepted':
                    this.emit('connect')
                    break
                case 'denied':
                    this.emit('error', 'connection not accepted')
                    this.socket.end()
                    break
                case 'msg':
                    this.emit('message', data.d)
                    break
                case 'ask':
                    this.emit('ask', data.d, (message: any) =>
                        this.respond(data.id, message)
                    )
                    break
                case 'resp':
                    let question = this.outstandingQuestionMap.get(data.id)
                    if (!question) {
                        this.emit(
                            'error',
                            'Response received for unknown id ' + data.id
                        )
                    } else {
                        question.deferred.resolve(data.d)
                        global.clearTimeout(question.timer)
                        this.outstandingQuestionMap.delete(data.id)
                    }
                    break
                default:
                    throw `Unexpected data ${data}`
            }
        }
    }
}
