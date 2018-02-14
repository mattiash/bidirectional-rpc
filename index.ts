import * as net from 'net'
import * as readline from 'readline'
import { EventEmitter } from 'events'

export class RPCServer extends EventEmitter {
    private server: net.Server
    constructor() {
        super()
        this.server = new net.Server()
        this.server.on('listening', () => this.emit('listening'))
        this.server.on('close', () => this.emit('close'))
        this.server.on('error', err => this.emit('error', err))
        this.server.on('connection', (client: net.Socket) =>
            this.newClient(client)
        )
    }

    on(event: 'listening', listener: () => void): this
    on(event: 'close', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'connection', listener: (client: RPCClient) => void): this
    on(event: string, listener: (...args: any[]) => void) {
        return super.on(event, listener)
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

    newClient(socket: net.Socket) {
        this.emit('connection', new RPCClient(socket))
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
    private socket: net.Socket
    private rl: readline.ReadLine
    private msgId = 0
    private outstandingQuestionMap: Map<number, Question> = new Map()

    constructor(port: number, ip: string)
    constructor(socket: net.Socket)
    constructor(p1: net.Socket | number, p2?: string) {
        super()
        if (typeof p1 === 'number' && typeof p2 === 'string') {
            this.socket = new net.Socket()
            this.socket.connect(p1, p2)
            this.socket.on('connect', () => this.emit('connect'))
        } else {
            this.socket = p1 as net.Socket
        }

        this.socket.on('close', (had_error: boolean) =>
            this.emit('close', had_error)
        )
        this.rl = readline.createInterface(this.socket)
        this.rl.on('line', line => this.receive(line))
    }

    on(event: 'connect', listener: () => void): this
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

    sendMessage(message: any) {
        this.socket.write(
            JSON.stringify({
                t: 'msg',
                d: message
            }) + '\n'
        )
    }

    ask(message: any, timeout: number = 2000): Promise<any> {
        let deferred = new Deferred()
        let id = this.msgId++
        let timer = global.setTimeout(() => {
            this.outstandingQuestionMap.delete(id)
            deferred.reject('timeout'), timeout
        }, 2000)
        this.outstandingQuestionMap.set(id, { deferred, timer })
        this.socket.write(
            JSON.stringify({
                t: 'ask',
                d: message,
                id
            }) + '\n'
        )
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

    private receive(line: string) {
        let data = JSON.parse(line)
        switch (data.t) {
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
