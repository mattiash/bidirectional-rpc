import { from, Observable } from 'rxjs'
import { toArray, take } from 'rxjs/operators'

async function run() {
    console.log(
        await from([1, 2, 3])
            .pipe(toArray())
            .toPromise()
    )

    let c = 0
    let obs = new Observable((observer) => {
        let me = c++
        observer.next('test ' + me)
        setTimeout(() => {
            console.log('timer ' + me)
            observer.next('test2 ' + me), 1000
            observer.complete()
        }, 1000)
        return () => {
            if (observer.closed) {
                console.log('closed ' + me)
            } else {
                console.log('not closed ' + me)
            }
        }
    })

    console.log(await obs.pipe(take(1), toArray()).toPromise())

    console.log(await obs.pipe(toArray()).toPromise())
}

run()
