import * as tls from 'tls'
import * as readline from 'readline'
import { EventEmitter } from 'events'
import * as assert from 'assert'
import { Deferred } from './deferred'

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

    sendMessage(message: any) {
        this.send('msg', message)
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

    outstandingQuestions(): number {
        return this.outstandingQuestionMap.size
    }

    close() {
        this.socket.end()
    }

    _accept() {
        assert(!this.initialized)
        this.initialized = true
        this.send('accepted')
    }

    _deny() {
        assert(!this.initialized)
        this.send('denied')
        this.socket.end()
    }

    private send(type: string, data?: any, id?: number) {
        this.socket.write(
            JSON.stringify({
                t: type,
                d: data,
                id // If id is undefined it is not represented in json
            }) + '\n'
        )
    }

    private sendInit() {
        this.send('init', this.token)
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
