# Bidirectional RPC

[![Build Status](https://travis-ci.org/mattiash/bidirectional-rpc.svg?branch=master)](https://travis-ci.org/mattiash/bidirectional-rpc) [![Coverage Status](https://coveralls.io/repos/github/mattiash/bidirectional-rpc/badge.svg?branch=master)](https://coveralls.io/github/mattiash/bidirectional-rpc?branch=master)

This module implements an RPC mechanism that meets the following requirements:

1.  Initialized from one end-point (client) to the other (server).
2.  A message can be sent both from server to client and from client to server.
3.  A question is a message that requests a response from the other end. Questions can be asked both by the server and the client.
4.  The end-point that receives a question can send the response asynchronously.
5.  All messages and responses are sent and delivered as javascript data that can be serialized as json.
6.  All communication is sent over a tcp socket protected with TLS.
7.  Communication is protected against man-in-the-middle attacks if the client and server have a trust relationship established via some other mechanism.
8.  The RPC mechanism exits with an error in both server and client if the communication fails.

## Examples

See examples/.

## License

ISC License

Copyright (c) 2018-2020, Mattias Holmlund, <mattias@holmlund.se>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
