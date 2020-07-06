# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.1] - 2020-06-06

-   Don't fire onConnect() before accepting connection.

## [5.0.0] - 2019-12-02

-   Add a "closed" promise to clients
    and make onClose an async function.

-   RPCClientHandler.client is now undefined
    before the handler has been initialized.

## [4.0.2] - 2019-09-18

-   PR #8: Do cleanup and destroy socket in close() (@jpttrssn)

## [4.0.1] - 2019-06-29

Update dependencies and npm scripts.

## [4.0.0] - 2019-06-10

### Breaking changes

-   Constructors for RPCServer and RPCClient now take an object as parameter

### Enhancements

-   Add rejectUnauthorized parameter to RPCServer
-   Reject all outstanding questions when socket is closed

## [3.2.0] - 2019-06-05

-   Added keep-alive function
    -   Send a ping message 20 seconds after the latest message was sent to keep the tcp connection alive.
    -   Close the connection if no message is received from the peer during 30 seconds.
    -   The keep-alive function is only enabled if both peers run a version of bidirectional-rpc
        with keep-alive support.
-   Disable the Nagle algorithm to avoid delays when sending messages

## [3.1.0] - 2019-05-28

-   Allow rpc-server to run over un-encrypted TCP. Useful if it is behind TLS terminator.
-   Allow pre-shared secrets as tokens.

## [3.0.4] - 2019-01-14

-   Handle json parsing errors before a session has been initialized.

## [3.0.3] - 2018-12-05

-   Call onError and close the socket if the client fails to parse JSON.

## [3.0.2] - 2018-12-03

-   Include the bad JSON in the error when JSON parse fails.

## [3.0.1] - 2018-09-19

-   RPCClientHandler now extends EventEmitter to allow it to emit events.

## [3.0.0] - 2018-09-13

-   Don't publish ts-files in npm-package to avoid conflicts
-   Make RPCClientHandler an abstract class to force user to override methods

## [2.0.2] - 2018-09-13

### Added

-   Enabled TCP Keepalive. It will tear down the TCP connection after 10s if
    the TCP connection is brolen.

### Changed

-   Use stricter typings

## [2.0.0] - 2018-07-26

### Added

-   Added a possibility to expose observables and subscribe to them
    via the RPC-mechanism.

### Changed

-   Rewrote the API for interacting with the client. This replaces the events emitted
    by the client with callbacks on an object that derives from RPCClientHandler.
    The change was done to make it easier to keep state per client and make sure
    that callbacks were only fired once.

## [1.0.1] - 2018-07-10

### Fixed

-   Fix typing problem

## [1.0.0] - 2018-07-10

Initial release.
