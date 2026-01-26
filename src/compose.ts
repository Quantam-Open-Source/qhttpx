import { Middleware, RequestContext, NextFunction } from '../types';

export function compose(middleware: Middleware[]) {
    if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!');
    for (const fn of middleware) {
        if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!');
    }

    return function (context: RequestContext, next?: NextFunction) {
        // last called middleware #
        let index = -1;
        return dispatch(0);
        
        function dispatch(i: number): Promise<void> {
            if (i <= index) return Promise.reject(new Error('next() called multiple times'));
            index = i;
            let fn = middleware[i];
            if (i === middleware.length) fn = next as any;
            if (!fn) return Promise.resolve();
            
            try {
                return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
            } catch (err) {
                return Promise.reject(err);
            }
        }
    }
}
