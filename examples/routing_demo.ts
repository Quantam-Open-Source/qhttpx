import { Q } from '../src';

const app = Q.app();

app.get('/')
   .desc('Root endpoint')
   .use((ctx, state) => ({ message: 'Handled root request in JS!' }))
   .respond();

app.get('/users/:id')
   .desc('Get user by ID')
   .use((ctx, state) => ({
       id: state.params.id,
       message: 'Handled user request in JS!'
   }))
   .respond();

app.post('/data')
   .use((ctx, state) => ({ message: 'Handled POST request in JS!' }))
   .respond();

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
