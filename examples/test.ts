import * as rpc from '../index'

let server = new rpc.RPCServer()
server.listen(12345, '127.0.0.1')
server.on('connection', (client: rpc.RPCClient) => {
    client.on('message', data => {
        console.log('Server received', data)
        client.sendMessage({ test: 'back' })
    })
})

setTimeout(() => {
    let client = new rpc.RPCClient(12345, '127.0.0.1')
    client.on('message', data => {
        console.log('Client received', data)
    })
    client.sendMessage({ test: 1 })
}, 1000)
