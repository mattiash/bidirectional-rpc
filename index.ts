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

export class RPCClient extends EventEmitter {
    private socket: net.Socket
    private rl: readline.ReadLine

    constructor(port: number, ip: string)
    constructor(socket: net.Socket)
    constructor(p1: net.Socket | number, p2?: string) {
        super()
        if (typeof p1 === 'number' && typeof p2 === 'string') {
            this.socket = new net.Socket()
            this.socket.connect(p1, p2)
        } else {
            this.socket = p1 as net.Socket
        }

        this.rl = readline.createInterface(this.socket)
        this.rl.on('line', line => this.receive(line))
    }

    sendMessage(message: any) {
        this.socket.write(JSON.stringify({ t: 'msg', d: message }) + '\n')
    }

    private receive(line: string) {
        let data = JSON.parse(line)
        switch (data.t) {
            case 'msg':
                this.emit('message', data.d)
                break
            default:
                throw `Unexpected data ${data}`
        }
    }
}
