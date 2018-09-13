export class Deferred<T> {
    promise: Promise<T>
    resolve: (arg: T) => void = () => Promise.resolve()
    reject: (reason: any) => void = () => Promise.reject()

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}
