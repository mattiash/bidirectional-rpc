/*
import 'source-map-support/register'
import * as rpc from '../index'

let token = process.argv[2]
let fingerprint = process.argv[3]

console.log('Token', token)
console.log('Fingerprint', fingerprint)
let client = new rpc.RPCClient(12345, '127.0.0.1', token, fingerprint)
client.on('connect', () => {
    client.sendMessage({ test: 1 })
})
client.on('message', data => {
    console.log('Client received', data)
})
client.on('error', error => {
    console.log('error', error)
})
client.on('close', () => console.log('close'))
*/
