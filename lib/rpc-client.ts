import * as net from 'net'
import * as tls from 'tls'
import * as readline from 'readline'
import { EventEmitter } from 'events'
import * as assert from 'assert'
import { Deferred } from './deferred'
import { Observable, Observer, Subscription, throwError } from 'rxjs'

let IDLE_TIMEOUT_DEFAULT = 30_000
const IDLE_TIMEOUT_FACTOR = 2 / 3

/** For testing only */
export function _SET_IDLE_TIMEOUT_DEFAULT(t: number) {
    IDLE_TIMEOUT_DEFAULT = t
}
interface Question {
    deferred: Deferred<any>
    timer: NodeJS.Timer
}

export type ResponderFunction = (response: any) => void
export type ObservableResponderFunction = (
    resp: Observable<any> | undefined
) => void

/**
 * 
 * @param handler object that handles all requests/responses
 * @param host IP address/hostname that the server is listening on
 * @param port TCP port number that the server is listening on
 * @param token Use this to authenticate to the server
 * @param fingerprint Only connect to the server
 *                    if it presents a certificate with this fingerprint

 */
interface RPCClientOptions {
    handler: RPCClientHandler
    host: string
    port: number
    token: string
    fingerprint?: string
}

export class RPCClient extends EventEmitter {
    private socket: tls.TLSSocket | net.Socket
    private closed = false
    private rl: readline.ReadLine
    private msgId = 0
    private observableId = 0
    private handler!: RPCClientHandler
    // We must send something more often than this to keep
    // our peer from timing out the connection.
    // 0 means that we are not allowed to send ping and the peer
    // does not accept it
    private idleTimeout = IDLE_TIMEOUT_DEFAULT

    // We shall timeout the connection if we hear nothing from our peer
    // at least this often.
    private peerIdleTimeout = 0

    // When we last sent something to our peer
    private lastTransmit = Date.now()

    // When we last received something from our peer
    private lastReceive = Date.now()

    // The local observers in this node that shall get messages emitted
    // by an observable in the peer.
    private observers = new Map<number, Observer<any>>()

    // The subscriptions to local Observables. Each subscription
    // forwards any received values to the peer.
    private subscriptions = new Map<number, Subscription>()
    private outstandingQuestionMap: Map<number, Question> = new Map()
    private initialized = false
    private fingerprint: string | undefined
    private idleTimer?: NodeJS.Timer
    private peerIdleTimer?: NodeJS.Timer
    /**
     * Create an RPCClient and initiate connection to a server.
     *
     */
    constructor(p1: RPCClientOptions | tls.TLSSocket | net.Socket) {
        super()
        if (p1 instanceof tls.TLSSocket || p1 instanceof net.Socket) {
            this.socket = p1
            this.socket.setNoDelay(true)
        } else {
            const token = p1.token
            this.fingerprint = p1.fingerprint

            this.setHandler(p1.handler)
            const socket = tls.connect({
                host: p1.host,
                port: p1.port,
                rejectUnauthorized: false
            })
            socket.setNoDelay(true)
            socket.on('secureConnect', () => {
                if (this.fingerprint) {
                    if (
                        socket.getPeerCertificate().fingerprint !==
                        this.fingerprint
                    ) {
                        socket.end()
                        this.handler.onError(
                            new Error('Wrong certificate presented by server')
                        )
                        return
                    }
                }
                this.sendInit(token)
            })
            this.socket = socket
        }

        this.socket.on('close', (had_error: boolean) => {
            this.closed = true
            this.subscriptions.forEach(subscription =>
                subscription.unsubscribe()
            )
            this.subscriptions = new Map()
            this.observers.forEach(observer => observer.complete())
            this.observers = new Map()
            this.outstandingQuestionMap.forEach(q => {
                q.deferred.reject(new Error('closed'))
            })
            this.outstandingQuestionMap = new Map()

            if (this.handler && this.initialized) {
                this.handler.onClose(had_error)
            }
            if (this.idleTimer) {
                clearTimeout(this.idleTimer)
            }
            if (this.peerIdleTimer) {
                clearTimeout(this.peerIdleTimer)
            }
        })

        this.socket.on('error', (err: Error) => {
            if (err.message === 'socket hang up') {
                // Other end closed connection before we received anything
                // This happens when the client rejects the fingerprint of the client
                this.socket.end()
            } else if (err.message === 'read ECONNRESET') {
                // Other end closed connection. This happens when we send a deny-message
                // to the other end.
                this.socket.end()
            } else {
                if (this.handler) {
                    this.handler.onError(err)
                } else {
                    throw err
                }
            }
        })

        this.rl = readline.createInterface({
            input: this.socket,
            output: this.socket
        })
        this.rl.on('line', line => this.receive(line))
    }

    setHandler(handler: RPCClientHandler) {
        this.handler = handler
        handler.initialize(this)
    }

    // Internal event handled by RPCServer
    on(event: 'initialized' | 'error', listener: (token: string) => void): this
    on(event: string, listener: (...args: any[]) => void) {
        return super.on(event, listener)
    }

    /**
     * Send a message to the peer without asking for a response
     *
     * @param message
     */
    sendMessage(message: any) {
        this.send('msg', message)
    }

    /**
     * Ask the peer a question and expect a response
     * Returns a promise that resolves with the response or
     * rejects if no response is received within the timeout.
     *
     * @param question
     * @param timeout
     */
    askQuestion(question: any, timeout = 2000): Promise<any> {
        let deferred = new Deferred()
        let id = this.msgId++
        let timer = global.setTimeout(() => {
            deferred.reject('timeout')
        }, timeout)
        this.outstandingQuestionMap.set(id, { deferred, timer })
        this.send('ask', question, id)
        return deferred.promise
    }

    /**
     * Request an observable from the peer.
     *
     * Note that a cold observable is returned. This means that
     * no request has actually been sent to the peer. It will
     * be sent when someone subscribes to the observable.
     *
     * @param params
     */
    requestObservable(params: any): Observable<any> {
        params = clone(params)

        return new Observable<any>(observer => {
            let observableId = this.observableId++
            this.observers.set(observableId, observer)
            this.send('subscribeObservable', params, observableId)
            return () => {
                if (!this.closed) {
                    // If the socket is closed, the observer will be deleted
                    // in the on('close') and we cannot send messages.
                    if (this.observers.has(observableId)) {
                        // The observer no longer wants to receive more values
                        this.observers.delete(observableId)
                        this.send('cancelObservable', {}, observableId)
                    }
                }
            }
        })
    }

    /**
     * Number of outstanding questions to the peer
     *
     */
    outstandingQuestions(): number {
        return this.outstandingQuestionMap.size
    }

    /**
     * Close the session. A 'close' event will be emitted in both
     * the local and the remote RPCClient.
     *
     */
    close() {
        this.socket.end()
    }

    _accept() {
        assert(!this.initialized)
        this.initialized = true
        this.handler.onConnect()
        this.send('accepted', undefined, undefined, {
            idleTimeout: IDLE_TIMEOUT_DEFAULT
        })
    }

    _deny() {
        assert(!this.initialized)
        this.send('denied')
        this.socket.end()
    }

    _observers() {
        return this.observers.size
    }

    _subscriptions() {
        return this.subscriptions.size
    }

    private send(
        type: string,
        data?: any,
        id?: number,
        extra: { [key: string]: string | number } = {}
    ) {
        this.lastTransmit = Date.now()
        this.socket.write(
            JSON.stringify({
                t: type,
                d: data,
                id, // If id is undefined it is not represented in json
                ...extra
            }) + '\n'
        )
    }

    private sendInit(token: string) {
        this.send('init', token, undefined, {
            idleTimeout: IDLE_TIMEOUT_DEFAULT
        })
    }

    private respond(id: number, message: any) {
        if (!this.socket.destroyed) {
            this.socket.write(
                JSON.stringify({
                    t: 'resp',
                    id,
                    d: message
                }) + '\n'
            )
        }
    }

    private respondError(id: number, message: any) {
        if (!this.socket.destroyed) {
            this.socket.write(
                JSON.stringify({
                    t: 'respError',
                    id,
                    d: message
                }) + '\n'
            )
        }
    }

    private receive(line: string) {
        let data: any
        this.lastReceive = Date.now()
        try {
            data = JSON.parse(line)
        } catch (e) {
            const error = new Error(`Failed to parse '${line}' as JSON`)
            if (this.handler) {
                this.handler.onError(error)
            } else {
                this.emit('error', error)
            }
            this.socket.end()
            return
        }

        if (!this.initialized) {
            switch (data.t) {
                case 'init':
                    if (data.idleTimeout) {
                        this.peerIdleTimeout = data.idleTimeout
                        this.setIdleTimeout()
                        this.setPeerIdleTimeout()
                    } else {
                        this.idleTimeout = 0
                    }

                    this.emit('initialized', data.d)
                    break
                case 'accepted':
                    if (data.idleTimeout) {
                        this.peerIdleTimeout = data.idleTimeout
                        this.setIdleTimeout()
                        this.setPeerIdleTimeout()
                    } else {
                        this.idleTimeout = 0
                    }
                    this.initialized = true
                    this.handler.onConnect()
                    break
                case 'denied':
                    this.handler.onError(new Error('Connection not accepted'))
                    this.socket.end()
            }
        } else {
            switch (data.t) {
                case 'msg':
                    this.handler.onMessage(data.d)
                    break
                case 'ask':
                    this.handler
                        .onQuestion(data.d)
                        .then(response => {
                            this.respond(data.id, response)
                        })
                        .catch(response => {
                            this.respondError(data.id, response)
                        })
                    break
                case 'resp':
                    {
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
                    }
                    break
                case 'respError':
                    {
                        let question = this.outstandingQuestionMap.get(data.id)
                        if (!question) {
                            this.emit(
                                'error',
                                'Response received for unknown id ' + data.id
                            )
                        } else {
                            question.deferred.reject(data.d)
                            global.clearTimeout(question.timer)
                            this.outstandingQuestionMap.delete(data.id)
                        }
                    }
                    break
                case 'obs': // Data for an observable from peer
                    {
                        let observableId = data.id
                        let value = data.d
                        let observer = this.observers.get(observableId)
                        if (observer) {
                            observer.next(value)
                        }
                    }
                    break

                case 'obsComplete': // An observable completed on the peer
                    {
                        let observableId = data.id
                        let observer = this.observers.get(observableId)
                        if (observer) {
                            this.observers.delete(observableId)
                            observer.complete()
                        }
                    }
                    break

                case 'subscribeObservable':
                    {
                        // The peer wants to subscribe to an observable
                        let peerObservableId = data.id
                        let obs = this.handler.onRequestObservable(data.d)
                        if (!obs) {
                            obs = throwError('Cannot create observable')
                        }

                        let subscription = obs.subscribe(
                            value => this.send('obs', value, peerObservableId),
                            undefined, // TODO: Handle errors
                            () => {
                                if (!this.closed) {
                                    this.send(
                                        'obsComplete',
                                        undefined,
                                        peerObservableId
                                    )
                                    this.subscriptions.delete(peerObservableId)
                                }
                            }
                        )
                        this.subscriptions.set(peerObservableId, subscription)
                    }
                    break

                case 'cancelObservable':
                    {
                        // The peer wants to cancel a subscription
                        let peerObservableId = data.id
                        let subscription = this.subscriptions.get(
                            peerObservableId
                        )
                        if (subscription) {
                            this.subscriptions.delete(peerObservableId)
                            subscription.unsubscribe()
                        } else {
                            // The observable was probably unsubscribed and
                            // completed at the same time
                        }
                    }
                    break

                case 'ping':
                    break

                default:
                    throw new Error(`Unexpected data ${data.t}`)
            }
        }
    }

    private setPeerIdleTimeout() {
        if (this.peerIdleTimeout) {
            this.peerIdleTimer = setTimeout(
                () => this.checkPeerIdle(),
                this.lastReceive + this.peerIdleTimeout - Date.now()
            )
        }
    }

    checkPeerIdle() {
        if (Date.now() - this.lastReceive >= this.peerIdleTimeout) {
            this.close()
        } else {
            this.setPeerIdleTimeout()
        }
    }

    private setIdleTimeout() {
        if (this.idleTimeout) {
            this.idleTimer = setTimeout(
                () => this.avoidIdle(),
                this.lastTransmit +
                    this.idleTimeout * IDLE_TIMEOUT_FACTOR -
                    Date.now()
            )
        }
    }

    private avoidIdle() {
        if (
            this.lastTransmit <
            Date.now() - this.idleTimeout * IDLE_TIMEOUT_FACTOR
        ) {
            this.send('ping')
        }
        this.setIdleTimeout()
    }
}

export abstract class RPCClientHandler extends EventEmitter {
    constructor() {
        super()
    }
    client: RPCClient = {} as RPCClient

    initialize(client: RPCClient) {
        this.client = client
    }

    /**
     * Called when successfully connected to a peer.
     */
    onConnect() {}

    /**
     * Called when the connection to the peer ends.
     *
     * @param _had_error true if the connection was ended due to an error.
     *
     */
    onClose(_had_error: boolean) {}

    /**
     * Called when a message is received from the peer.
     * @param _message
     */
    abstract onMessage(_message: any): void

    /**
     * Called when a question is received from the peer. Must return
     * a Promise that resolves with the answer or rejects.
     *
     * @param _question
     */
    abstract onQuestion(_question: any): Promise<any>

    /**
     * Called when the peer wants to to request an observable
     * and subscribe to it.
     *
     * @param _params
     * @returns an Observable or undefined if the Observable cannot be created.
     *
     */
    abstract onRequestObservable(_params: any): Observable<any> | undefined

    onError(err: Error) {
        throw err
    }
}

function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
}
