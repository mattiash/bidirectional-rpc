# Bidirectional RPC

This module implements an RPC mechanism that meets the following requirements:

1. Initialized from one end-point (client) to the other (server).
2. A message can be sent both from server to client and from client to server.
3. A question is a message that requests a response from the other end. Questions can be asked both by the server and the client.
4. The end-point that receives a question can answer with a promise that resolves with the response.
5. All messages and responses are sent and delivered as javascript data that can be serialized as json.
6. All communication is sent over a tcp socket protected with TLS.
7. Communication is protected against man-in-the-middle attacks if the client and server have a trust relationship established via some other mechanism.
8. The RPC mechanism exits with an error in both server and client if the communication fails.

## Server Example

    let server = new Server(ip, port)