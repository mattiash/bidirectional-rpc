import * as rpc from '../index'
import * as fs from 'fs'
const cert = fs.readFileSync('../test/server-cert.pem').toString()
const key = fs.readFileSync('../test/server-key.pem').toString()
const server = new rpc.RPCServer(key, cert)
server.listen(12345, '127.0.0.1')
server.on('connection', (client: rpc.RPCClient) => {
    client.on('message', data => {
        console.log('Server received', data)
        client.sendMessage({ test: 'back' })
    })
})

setTimeout(() => {
    let client = new rpc.RPCClient(12345, '127.0.0.1', 'token')
    client.on('message', data => {
        console.log('Client received', data)
    })
    client.sendMessage({ test: 1 })
}, 1000)
