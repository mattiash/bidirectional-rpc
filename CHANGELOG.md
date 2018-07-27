# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

-   Enabled TCP Keepalive. It will tear down the TCP connection after 10s if
    the TCP connection is brolen.

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
