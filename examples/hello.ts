import { Q } from '../src';

const app = Q.app();

app.get('/')
   .use(() => ({ message: 'Hello World' }))
   .respond();

app.listen(3000, () => {
    console.log("Server started on port 3000");
});
