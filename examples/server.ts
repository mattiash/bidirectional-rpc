import * as rpc from '../index'
import * as fs from 'fs'
const cert = fs.readFileSync('../test/server-cert.pem').toString()
const key = fs.readFileSync('../test/server-key.pem').toString()

const TOKEN = 'secret'
async function run() {
    const server = new rpc.RPCServer(key, cert)
    server.listen(12345, '127.0.0.1')
    console.log('Token:', TOKEN)
    console.log('Fingerprint:', await server.fingerprint())
    server.on('connection', (client: rpc.RPCClient, token) => {
        if (token !== TOKEN) {
            console.log('Client rejected because of wrong token')
            client.close()
        } else {
            console.log('Client accepted')
            client.on('message', data => {
                console.log('Server received', data)
                client.sendMessage({ test: 'back' })
            })
            client.on('close', () => {
                console.log('Client disconnected')
            })
        }
    })
}

run()
