import { Q } from '../src';

const app = Q.app();

app.get('/headers')
   .use((ctx, state) => {
       const userAgent = ctx.headers.get('user-agent') || 'Unknown';
       const host = ctx.headers.get('host') || 'Unknown';
       
       console.log(`User-Agent: ${userAgent}`);
       console.log(`Path from URL: ${ctx.url.pathname}`);
       
       return { 
           userAgent, 
           host,
           path: ctx.url.pathname,
           fullUrl: ctx.url.toString()
       };
   })
   .respond();

app.listen(3000, () => {
    console.log('Headers Demo running on port 3000');
});
