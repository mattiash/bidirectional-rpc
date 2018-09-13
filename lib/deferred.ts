export class Deferred<T> {
    promise: Promise<T>
    resolve!: (arg: T) => void
    reject!: (reason: any) => void

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}
